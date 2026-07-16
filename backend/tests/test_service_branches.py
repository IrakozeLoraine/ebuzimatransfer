"""Service-level tests targeting guard/branch paths in ReferralService,
UserService and the referral repository's role-scoped listing — the error and
edge cases that the API happy-path tests don't reach."""
import uuid
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace

import pytest
import pytest_asyncio

from app.core.exceptions import (
    NotFoundError,
    ValidationError,
    ForbiddenError,
    InvalidStatusTransitionError,
)
from app.models.unit import Unit
from app.models.resource import Resource
from app.models.facility import Facility
from app.models.referral import ReferralStatus, ReferralStatusHistory, ArrivalCondition
from app.schemas.referral import (
    ReferralCreate,
    ReferralUpdate,
    AcceptReferralRequest,
    RejectReferralRequest,
)
from app.schemas.user import UserCreate, UserUpdate
from app.services.referral_service import ReferralService
from app.services.user_service import UserService

pytestmark = pytest.mark.asyncio


def _admin_actor(user_id, facility_id=None):
    return SimpleNamespace(
        id=user_id, effective_roles=["SUPER_ADMIN"],
        active_facility_id=facility_id, facilities=[], unit_ids=[],
    )


@pytest_asyncio.fixture
async def env(db_session, user_factory):
    creator, facility = await user_factory(medical_id="MED-SB")
    unit = Unit(name="ICU", tier="DISTRICT")
    db_session.add(unit)
    await db_session.flush()
    resource = Resource(resource_name="Bed", facility_id=facility.id, unit_id=unit.id, quantity=3)
    db_session.add(resource)
    await db_session.commit()
    return SimpleNamespace(session=db_session, creator=creator, facility=facility, unit=unit, resource=resource)


def _payload(env):
    return ReferralCreate(
        sex="F", diagnosis="dx", reason_for_transfer="why",
        preferred_facility_id=env.facility.id, requested_unit_id=env.unit.id,
        requested_resource_ids=[env.resource.id],
    )


class TestReferralGuards:
    async def test_get_unknown_raises_not_found(self, env):
        with pytest.raises(NotFoundError):
            await ReferralService(env.session).get(uuid.uuid4())

    async def test_complete_form_unknown_raises(self, env):
        svc = ReferralService(env.session)
        with pytest.raises(NotFoundError):
            await svc.complete_form(uuid.uuid4(), ReferralUpdate(diagnosis="x"), _admin_actor(env.creator.id))

    async def test_complete_form_blocked_after_reject(self, env):
        svc = ReferralService(env.session)
        referral = await svc.create(_payload(env), created_by=env.creator.id, referring_facility_id=env.facility.id)
        await svc.reject(referral.id, RejectReferralRequest(reason="no"), _admin_actor(env.creator.id))
        with pytest.raises(ValidationError):
            await svc.complete_form(referral.id, ReferralUpdate(diagnosis="x"), _admin_actor(env.creator.id))

    async def test_accept_unknown_raises(self, env):
        with pytest.raises(NotFoundError):
            await ReferralService(env.session).accept(uuid.uuid4(), AcceptReferralRequest(), _admin_actor(env.creator.id))

    async def test_reject_unknown_raises(self, env):
        with pytest.raises(NotFoundError):
            await ReferralService(env.session).reject(uuid.uuid4(), RejectReferralRequest(reason="x"), _admin_actor(env.creator.id))

    async def test_accept_wrong_state_raises_transition(self, env):
        svc = ReferralService(env.session)
        referral = await svc.create(_payload(env), created_by=env.creator.id, referring_facility_id=env.facility.id)
        await svc.reject(referral.id, RejectReferralRequest(reason="no"), _admin_actor(env.creator.id))
        with pytest.raises(InvalidStatusTransitionError):
            await svc.accept(referral.id, AcceptReferralRequest(), _admin_actor(env.creator.id))

    async def test_mark_arrived_unknown_raises(self, env):
        with pytest.raises(NotFoundError):
            await ReferralService(env.session).mark_arrived(uuid.uuid4(), _admin_actor(env.creator.id))

    async def test_set_arrival_condition_requires_arrived(self, env):
        svc = ReferralService(env.session)
        referral = await svc.create(_payload(env), created_by=env.creator.id, referring_facility_id=env.facility.id)
        # Still REQUESTED — recording a condition is not yet allowed.
        with pytest.raises(ValidationError):
            await svc.set_arrival_condition(referral.id, ArrivalCondition.STABLE, _admin_actor(env.creator.id))

    async def test_set_arrival_condition_after_arrival(self, env):
        svc = ReferralService(env.session)
        referral = await svc.create(_payload(env), created_by=env.creator.id, referring_facility_id=env.facility.id)
        await svc.accept(referral.id, AcceptReferralRequest(), _admin_actor(env.creator.id))
        await svc.mark_arrived(referral.id, _admin_actor(env.creator.id))
        updated = await svc.set_arrival_condition(referral.id, ArrivalCondition.CRITICAL, _admin_actor(env.creator.id))
        assert updated.arrival_condition == ArrivalCondition.CRITICAL

    async def test_save_feedback_unknown_raises(self, env):
        with pytest.raises(NotFoundError):
            await ReferralService(env.session).save_feedback(uuid.uuid4(), {"a": 1}, None, _admin_actor(env.creator.id))

    async def test_arrange_transport_requires_referring_facility(self, env):
        svc = ReferralService(env.session)
        # A draft-less referral with no referring facility, edited by a non-super clinician.
        referral = await svc.create(_payload(env), created_by=env.creator.id, referring_facility_id=None)
        outsider = SimpleNamespace(
            id=uuid.uuid4(), effective_roles=["CLINICIAN"], active_facility_id=uuid.uuid4(),
            facilities=[], unit_ids=[], units_for_facility=lambda fid: [],
        )
        with pytest.raises(ForbiddenError):
            svc.assert_can_arrange_transport(referral, outsider)


class TestTransitStats:
    async def test_empty_facility_scope_returns_zeroed(self, env):
        stats = await ReferralService(env.session).transit_stats(facility_ids=[])
        assert stats["completed_journeys"] == 0
        assert stats["average_minutes"] is None

    async def test_all_facilities_no_journeys(self, env):
        stats = await ReferralService(env.session).transit_stats(facility_ids=None)
        assert stats["completed_journeys"] == 0

    async def test_completed_journey_durations(self, env):
        svc = ReferralService(env.session)
        referral = await svc.create(_payload(env), created_by=env.creator.id, referring_facility_id=env.facility.id)
        # Hand-write EN_ROUTE and ARRIVED history 20 minutes apart.
        dep = datetime.now(timezone.utc) - timedelta(minutes=20)
        arr = datetime.now(timezone.utc)
        env.session.add(ReferralStatusHistory(referral_id=referral.id, status=ReferralStatus.EN_ROUTE, changed_by=env.creator.id, created_at=dep))
        env.session.add(ReferralStatusHistory(referral_id=referral.id, status=ReferralStatus.ARRIVED, changed_by=env.creator.id, created_at=arr))
        await env.session.commit()

        stats = await svc.transit_stats(facility_ids=[env.facility.id])
        assert stats["completed_journeys"] == 1
        assert stats["average_minutes"] is not None


class TestListVisibleScoping:
    async def test_super_admin_sees_all(self, env):
        svc = ReferralService(env.session)
        await svc.create(_payload(env), created_by=env.creator.id, referring_facility_id=env.facility.id)
        await env.session.commit()
        viewer = _admin_actor(env.creator.id)
        assert len(await svc.list_visible(viewer, status=ReferralStatus.REQUESTED)) >= 1

    async def test_facility_admin_scope(self, env):
        svc = ReferralService(env.session)
        await svc.create(_payload(env), created_by=env.creator.id, referring_facility_id=env.facility.id)
        await env.session.commit()
        viewer = SimpleNamespace(
            id=uuid.uuid4(), effective_roles=["FACILITY_ADMIN"],
            facilities=[SimpleNamespace(id=env.facility.id)], unit_ids=[],
        )
        assert len(await svc.list_visible(viewer)) >= 1

    async def test_facility_admin_with_no_facilities_sees_none(self, env):
        svc = ReferralService(env.session)
        viewer = SimpleNamespace(id=uuid.uuid4(), effective_roles=["FACILITY_ADMIN"], facilities=[], unit_ids=[])
        assert await svc.list_visible(viewer) == []

    async def test_clinician_sees_own(self, env):
        svc = ReferralService(env.session)
        await svc.create(_payload(env), created_by=env.creator.id, referring_facility_id=env.facility.id, origin_unit_id=env.unit.id)
        await env.session.commit()
        viewer = SimpleNamespace(id=env.creator.id, effective_roles=["CLINICIAN"], unit_ids=[env.unit.id])
        assert len(await svc.list_visible(viewer, status=ReferralStatus.REQUESTED)) >= 1


class TestUserServiceGuards:
    async def test_assign_to_deactivated_facility_rejected(self, env):
        svc = UserService(env.session)
        env.facility.is_active = False
        await env.session.flush()
        with pytest.raises(ValidationError):
            await svc.assign_roles(env.creator.medical_id, env.facility.id, ["CLINICIAN"])

    async def test_assign_missing_facility_raises(self, env):
        svc = UserService(env.session)
        with pytest.raises(NotFoundError):
            await svc.assign_roles(env.creator.medical_id, uuid.uuid4(), ["CLINICIAN"])

    async def test_assign_unknown_unit_raises(self, env):
        svc = UserService(env.session)
        with pytest.raises(NotFoundError):
            await svc.assign_roles(env.creator.medical_id, env.facility.id, ["CLINICIAN"], [uuid.uuid4()])

    async def test_set_status_forbidden_for_foreign_facility(self, env):
        svc = UserService(env.session)
        with pytest.raises(ForbiddenError):
            await svc.set_account_status(env.creator.id, "INACTIVE", acting_facility_id=uuid.uuid4())

    async def test_update_user_foreign_facility_forbidden(self, env):
        svc = UserService(env.session)
        with pytest.raises(ForbiddenError):
            await svc.update_user(env.creator.id, UserUpdate(first_name="X"), acting_facility_id=uuid.uuid4())

    async def test_update_user_email_conflict(self, env):
        svc = UserService(env.session)
        # A second user owns "taken@x.rw"; updating creator to it conflicts.
        other = await svc.create_user(UserCreate(medical_id="OTHER-1", first_name="O", last_name="P", email="taken@x.rw"))
        from app.core.exceptions import ConflictError
        with pytest.raises(ConflictError):
            await svc.update_user(env.creator.id, UserUpdate(email="taken@x.rw"))

    async def test_update_user_applies_fields(self, env):
        svc = UserService(env.session)
        updated = await svc.update_user(
            env.creator.id, UserUpdate(first_name="Renamed", last_name="Person", phone="0788", location="Kigali")
        )
        assert updated.first_name == "Renamed"
        assert updated.location == "Kigali"

    async def test_create_duplicate_email_conflict(self, env):
        svc = UserService(env.session)
        await svc.create_user(UserCreate(medical_id="DUP-EMAIL-1", first_name="A", last_name="B", email="dupe@x.rw"))
        from app.core.exceptions import ConflictError
        with pytest.raises(ConflictError):
            await svc.create_user(UserCreate(medical_id="DUP-EMAIL-2", first_name="C", last_name="D", email="dupe@x.rw"))
