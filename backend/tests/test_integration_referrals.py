"""Integration tests for the referral lifecycle against a real database.

These drive ``ReferralService`` end-to-end — through the repositories, the
resource reservation (``SELECT FOR UPDATE``) and the status history — so the
create → accept / reject flow and the bed-reservation accounting are all
exercised for real. Skipped automatically when no test database is reachable
(see ``conftest``).
"""
import uuid
from types import SimpleNamespace

import pytest
import pytest_asyncio

from app.core.exceptions import (
    ValidationError,
    ResourceReservedError,
    InvalidStatusTransitionError,
)
from app.models.facility import Facility
from app.models.referral import Referral, ReferralStatus
from app.models.resource import Resource
from app.models.unit import Unit
from app.schemas.referral import ReferralCreate, AcceptReferralRequest, RejectReferralRequest
from app.services.referral_service import ReferralService

pytestmark = pytest.mark.asyncio


def super_admin_actor(user_id: uuid.UUID):
    """A SUPER_ADMIN actor bypasses the facility/unit approval checks, keeping
    these tests focused on the create/accept/reject *mechanics* rather than the
    permission rules (those are covered by the unit tests)."""
    return SimpleNamespace(
        id=user_id, effective_roles=["SUPER_ADMIN"], active_facility_id=None, facilities=[], unit_ids=[]
    )


@pytest_asyncio.fixture
async def env(db_session, user_factory):
    """Seed a facility, a clinician, a unit and one available bed, and return the
    handles a test needs to build and drive a referral."""
    creator, facility = await user_factory(medical_id="MED-CREATE")

    unit = Unit(name="ICU", tier="DISTRICT")
    db_session.add(unit)
    await db_session.flush()

    def make_resource(quantity=1):
        resource = Resource(
            resource_name="ICU Bed",
            facility_id=facility.id,
            unit_id=unit.id,
            quantity=quantity,
        )
        db_session.add(resource)
        return resource

    return SimpleNamespace(
        session=db_session,
        creator=creator,
        facility=facility,
        unit=unit,
        make_resource=make_resource,
    )


def build_payload(env, resource_id):
    return ReferralCreate(
        sex="F",
        diagnosis="Severe sepsis",
        reason_for_transfer="Requires ICU care",
        preferred_facility_id=env.facility.id,
        requested_unit_id=env.unit.id,
        requested_resource_id=resource_id,
    )


class TestCreate:
    async def test_create_records_a_requested_referral(self, env):
        resource = env.make_resource()
        await env.session.flush()
        service = ReferralService(env.session)

        referral = await service.create(
            build_payload(env, resource.id),
            created_by=env.creator.id,
            referring_facility_id=env.facility.id,
        )

        assert referral.status == ReferralStatus.REQUESTED
        assert referral.referral_number
        # An initial REQUESTED history row is written.
        fetched = await service.get(referral.id)
        assert [h.status for h in fetched.status_history] == [ReferralStatus.REQUESTED]

    async def test_create_rejects_resource_at_a_different_facility(self, env):
        # A resource that lives at some other facility can't be requested here.
        other_facility = Facility(name="Other Hospital", type="DISTRICT")
        env.session.add(other_facility)
        await env.session.flush()
        other = Resource(resource_name="Bed", facility_id=other_facility.id, unit_id=env.unit.id, quantity=1)
        env.session.add(other)
        await env.session.flush()
        service = ReferralService(env.session)

        with pytest.raises(ValidationError):
            await service.create(build_payload(env, other.id), created_by=env.creator.id)

    async def test_create_rejects_an_unavailable_resource(self, env):
        resource = env.make_resource(quantity=1)
        resource.occupied = 1  # available == 0
        await env.session.flush()
        service = ReferralService(env.session)

        with pytest.raises(ValidationError):
            await service.create(build_payload(env, resource.id), created_by=env.creator.id)


class TestAcceptReject:
    async def _make_referral(self, env, resource):
        await env.session.flush()
        service = ReferralService(env.session)
        referral = await service.create(build_payload(env, resource.id), created_by=env.creator.id)
        return service, referral

    async def test_accept_reserves_the_bed_and_records_the_receiving_facility(self, env):
        resource = env.make_resource(quantity=1)
        service, referral = await self._make_referral(env, resource)

        accepted = await service.accept(
            referral.id, AcceptReferralRequest(resource_id=resource.id), super_admin_actor(env.creator.id)
        )

        assert accepted.status == ReferralStatus.ACCEPTED
        assert accepted.accepted_facility_id == env.facility.id
        # The bed is now held: reserved incremented, available drained to zero.
        await env.session.refresh(resource)
        assert resource.reserved == 1
        assert resource.available == 0

    async def test_two_referrals_cannot_reserve_the_same_last_bed(self, env):
        # One bed, two accepted transfers racing for it — the second must fail.
        resource = env.make_resource(quantity=1)
        await env.session.flush()
        service = ReferralService(env.session)
        r1 = await service.create(build_payload(env, resource.id), created_by=env.creator.id)
        r2 = await service.create(build_payload(env, resource.id), created_by=env.creator.id)

        await service.accept(r1.id, AcceptReferralRequest(resource_id=resource.id), super_admin_actor(env.creator.id))

        with pytest.raises(ResourceReservedError):
            await service.accept(
                r2.id, AcceptReferralRequest(resource_id=resource.id), super_admin_actor(env.creator.id)
            )

    async def test_reject_sets_reason_and_does_not_reserve(self, env):
        resource = env.make_resource(quantity=1)
        service, referral = await self._make_referral(env, resource)

        rejected = await service.reject(
            referral.id,
            RejectReferralRequest(reason="No ICU beds", comment="Try CHUK"),
            super_admin_actor(env.creator.id),
        )

        assert rejected.status == ReferralStatus.REJECTED
        assert rejected.rejection_reason == "No ICU beds"
        assert rejected.rejection_comment == "Try CHUK"
        # No bed was held.
        await env.session.refresh(resource)
        assert resource.reserved == 0


class TestChangeStatus:
    async def test_illegal_transition_is_rejected(self, env):
        resource = env.make_resource(quantity=1)
        await env.session.flush()
        service = ReferralService(env.session)
        referral = await service.create(build_payload(env, resource.id), created_by=env.creator.id)

        # REQUESTED → EN_ROUTE skips acceptance and transport; not allowed.
        with pytest.raises(InvalidStatusTransitionError):
            await service.change_status(referral.id, ReferralStatus.EN_ROUTE, env.creator.id)
