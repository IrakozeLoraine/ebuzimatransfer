"""Authorisation guards and update branches that the happy-path API tests miss.

The referral guards are pure attribute checks, so they're exercised directly
with lightweight stand-ins rather than persisted rows — that keeps them fast
and makes the rule under test obvious. The UserService cases need real rows
because they flush through the session.
"""
import uuid
from types import SimpleNamespace

import pytest

from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    InvalidStatusTransitionError,
    NotFoundError,
    ValidationError,
)
from app.models.facility import Facility
from app.models.referral import ArrivalCondition, ReferralStatus
from app.models.unit import Unit
from app.models.user import AccountStatus
from app.schemas.user import UserCreate, UserUpdate
from app.services.referral_service import ReferralService
from app.services.user_service import UserService


def _actor(*, user_id=None, roles=("CLINICIAN",), facility_id=None, unit_ids=()):
    return SimpleNamespace(
        id=user_id or uuid.uuid4(),
        effective_roles=list(roles),
        active_facility_id=facility_id,
        facilities=[],
        unit_ids=list(unit_ids),
    )


def _referral(*, created_by=None, preferred_facility_id=None, accepted_facility_id=None,
              requested_unit_id=None, status=ReferralStatus.REQUESTED):
    return SimpleNamespace(
        created_by=created_by or uuid.uuid4(),
        preferred_facility_id=preferred_facility_id,
        accepted_facility_id=accepted_facility_id,
        requested_unit_id=requested_unit_id,
        status=status,
    )


class TestApprovalGuard:
    """Who may approve a transfer request."""

    def test_super_admin_bypasses_every_check(self):
        # No facility, no unit, and they created it — still allowed.
        actor = _actor(roles=("SUPER_ADMIN",))
        referral = _referral(created_by=actor.id)
        ReferralService.assert_can_approve(None, referral, actor)

    def test_sender_cannot_approve_their_own_request(self):
        actor = _actor()
        referral = _referral(created_by=actor.id, preferred_facility_id=uuid.uuid4())
        with pytest.raises(ForbiddenError, match="cannot approve a transfer request you sent"):
            ReferralService.assert_can_approve(None, referral, actor)

    def test_staff_at_another_facility_cannot_approve(self):
        actor = _actor(facility_id=uuid.uuid4())
        referral = _referral(preferred_facility_id=uuid.uuid4())
        with pytest.raises(ForbiddenError, match="destination facility"):
            ReferralService.assert_can_approve(None, referral, actor)

    def test_request_without_a_destination_cannot_be_approved(self):
        actor = _actor(facility_id=uuid.uuid4())
        referral = _referral(preferred_facility_id=None)
        with pytest.raises(ForbiddenError, match="destination facility"):
            ReferralService.assert_can_approve(None, referral, actor)

    def test_clinician_outside_the_requested_unit_cannot_approve(self):
        facility_id = uuid.uuid4()
        actor = _actor(facility_id=facility_id, unit_ids=[uuid.uuid4()])
        referral = _referral(preferred_facility_id=facility_id, requested_unit_id=uuid.uuid4())
        with pytest.raises(ForbiddenError, match="requested unit"):
            ReferralService.assert_can_approve(None, referral, actor)

    def test_clinician_inside_the_requested_unit_may_approve(self):
        facility_id, unit_id = uuid.uuid4(), uuid.uuid4()
        actor = _actor(facility_id=facility_id, unit_ids=[unit_id])
        referral = _referral(preferred_facility_id=facility_id, requested_unit_id=unit_id)
        ReferralService.assert_can_approve(None, referral, actor)

    def test_facility_admin_is_not_bound_by_the_unit_constraint(self):
        # Facility admins manage the whole facility, so they may approve a
        # request for a unit they do not personally work in.
        facility_id = uuid.uuid4()
        actor = _actor(roles=("FACILITY_ADMIN",), facility_id=facility_id, unit_ids=[])
        referral = _referral(preferred_facility_id=facility_id, requested_unit_id=uuid.uuid4())
        ReferralService.assert_can_approve(None, referral, actor)

    def test_falls_back_to_membership_when_no_active_facility(self):
        # Without an active facility the actor's full membership list is used.
        facility_id = uuid.uuid4()
        actor = _actor(facility_id=None)
        actor.facilities = [SimpleNamespace(id=facility_id)]
        referral = _referral(preferred_facility_id=facility_id)
        ReferralService.assert_can_approve(None, referral, actor)


class TestArrivalGuard:
    """Who may record that the patient arrived, and in what condition."""

    def test_super_admin_is_exempt(self):
        actor = _actor(roles=("SUPER_ADMIN",))
        ReferralService.assert_can_record_arrival(None, _referral(created_by=actor.id), actor)

    def test_sending_clinician_cannot_record_arrival(self):
        actor = _actor()
        referral = _referral(created_by=actor.id, accepted_facility_id=uuid.uuid4())
        with pytest.raises(ForbiddenError, match="sending facility cannot record"):
            ReferralService.assert_can_record_arrival(None, referral, actor)

    def test_accepted_facility_takes_precedence_over_the_preferred_one(self):
        # A request may be accepted somewhere other than the facility it was
        # addressed to; the accepting facility is the one that sees the patient.
        accepted_id = uuid.uuid4()
        actor = _actor(facility_id=accepted_id)
        referral = _referral(preferred_facility_id=uuid.uuid4(), accepted_facility_id=accepted_id)
        ReferralService.assert_can_record_arrival(None, referral, actor)

    def test_staff_elsewhere_cannot_record_arrival(self):
        actor = _actor(facility_id=uuid.uuid4())
        referral = _referral(accepted_facility_id=uuid.uuid4())
        with pytest.raises(ForbiddenError, match="receiving facility"):
            ReferralService.assert_can_record_arrival(None, referral, actor)

    def test_referral_with_no_receiving_facility_is_rejected(self):
        actor = _actor(facility_id=uuid.uuid4())
        referral = _referral(preferred_facility_id=None, accepted_facility_id=None)
        with pytest.raises(ForbiddenError, match="receiving facility"):
            ReferralService.assert_can_record_arrival(None, referral, actor)


class TestArrivalTransitions:
    async def test_mark_arrived_requires_an_existing_referral(self, db_session):
        with pytest.raises(NotFoundError):
            await ReferralService(db_session).mark_arrived(uuid.uuid4(), _actor(roles=("SUPER_ADMIN",)))

    async def test_set_arrival_condition_requires_an_existing_referral(self, db_session):
        with pytest.raises(NotFoundError):
            await ReferralService(db_session).set_arrival_condition(
                uuid.uuid4(), ArrivalCondition.STABLE, _actor(roles=("SUPER_ADMIN",))
            )


class TestAssignRolesGuards:
    async def test_unknown_facility_is_not_found(self, db_session, make_auth):
        admin = await make_auth()
        with pytest.raises(NotFoundError, match="Facility"):
            await UserService(db_session).assign_roles(
                admin.user.medical_id, uuid.uuid4(), ["CLINICIAN"]
            )

    async def test_deactivated_facility_is_rejected(self, db_session, make_auth):
        admin = await make_auth()
        facility = await db_session.get(Facility, admin.facility.id)
        facility.is_active = False
        await db_session.commit()

        with pytest.raises(ValidationError, match="deactivated facility"):
            await UserService(db_session).assign_roles(
                admin.user.medical_id, admin.facility.id, ["CLINICIAN"]
            )

    async def test_unknown_unit_is_not_found(self, db_session, make_auth):
        admin = await make_auth()
        with pytest.raises(NotFoundError, match="Unit"):
            await UserService(db_session).assign_roles(
                admin.user.medical_id, admin.facility.id, ["CLINICIAN"], [uuid.uuid4()]
            )

    async def test_units_are_replaced_not_appended(self, db_session, make_auth):
        # Re-assigning is a replace so a user removed from a unit really loses it.
        admin = await make_auth()
        svc = UserService(db_session)
        icu = Unit(name="ICU-guard", tier="DISTRICT")
        theatre = Unit(name="Theatre-guard", tier="DISTRICT")
        db_session.add_all([icu, theatre])
        await db_session.flush()

        await svc.assign_roles(admin.user.medical_id, admin.facility.id, ["CLINICIAN"], [icu.id])
        user = await svc.assign_roles(
            admin.user.medical_id, admin.facility.id, ["CLINICIAN"], [theatre.id]
        )
        await db_session.commit()

        assert [fu.unit_id for fu in user.facility_units] == [theatre.id]


class TestAccountStatusAndUpdateGuards:
    async def test_facility_admin_cannot_touch_a_user_elsewhere(self, db_session, make_auth):
        target = await make_auth(roles=("CLINICIAN",))
        with pytest.raises(ForbiddenError):
            await UserService(db_session).set_account_status(
                target.user.id, AccountStatus.INACTIVE.value, acting_facility_id=uuid.uuid4()
            )

    async def test_reactivating_restores_the_active_flag(self, db_session, make_auth):
        target = await make_auth(roles=("CLINICIAN",))
        svc = UserService(db_session)

        await svc.set_account_status(target.user.id, AccountStatus.INACTIVE.value, None)
        assert target.user.is_active is False

        user = await svc.set_account_status(target.user.id, AccountStatus.ACTIVE.value, None)
        assert user.is_active is True

    async def test_update_is_scoped_to_the_admins_own_facility(self, db_session, make_auth):
        target = await make_auth(roles=("CLINICIAN",))
        with pytest.raises(ForbiddenError):
            await UserService(db_session).update_user(
                target.user.id, UserUpdate(first_name="Nope"), acting_facility_id=uuid.uuid4()
            )

    async def test_email_may_be_cleared(self, db_session, make_auth):
        admin = await make_auth()
        svc = UserService(db_session)
        user = await svc.create_user(
            UserCreate(medical_id="GUARD-CLR", first_name="A", last_name="B", email="clr@x.rw")
        )
        await db_session.commit()

        updated = await svc.update_user(user.id, UserUpdate(email=None))
        assert updated.email is None

    async def test_keeping_the_same_email_is_not_a_conflict(self, db_session, make_auth):
        # The uniqueness check must ignore the user's own current address.
        admin = await make_auth()
        svc = UserService(db_session)
        user = await svc.create_user(
            UserCreate(medical_id="GUARD-SAME", first_name="A", last_name="B", email="same@x.rw")
        )
        await db_session.commit()

        updated = await svc.update_user(user.id, UserUpdate(email="same@x.rw"))
        assert updated.email == "same@x.rw"

    async def test_names_are_updated_when_provided(self, db_session, make_auth):
        admin = await make_auth()
        svc = UserService(db_session)
        user = await svc.create_user(
            UserCreate(medical_id="GUARD-NAME", first_name="Old", last_name="Name")
        )
        await db_session.commit()

        updated = await svc.update_user(user.id, UserUpdate(first_name="New", last_name="Surname"))
        assert (updated.first_name, updated.last_name) == ("New", "Surname")
