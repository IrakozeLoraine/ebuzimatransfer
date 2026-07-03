"""Unit tests for the referral approval / arrival permission guards.

``assert_can_approve`` and ``assert_can_record_arrival`` are pure authorization
rules — they read only the passed referral and actor, never ``self`` or the
database — so we exercise them on a bare service instance with lightweight
stand-ins. These are the safety-critical gates deciding who may accept a
transfer or record how a patient arrived, so every branch is covered.
"""
import uuid
from types import SimpleNamespace

import pytest

from app.core.exceptions import ForbiddenError
from app.services.referral_service import ReferralService


# A bare instance: the guards never touch self, so we skip __init__ (and its DB
# wiring) entirely.
service = ReferralService.__new__(ReferralService)


def make_actor(*, roles=("CLINICIAN",), id=None, active_facility_id=None, facilities=(), unit_ids=()):
    return SimpleNamespace(
        effective_roles=list(roles),
        id=id or uuid.uuid4(),
        active_facility_id=active_facility_id,
        facilities=[SimpleNamespace(id=f) for f in facilities],
        unit_ids=list(unit_ids),
    )


def make_referral(*, created_by=None, preferred_facility_id=None, accepted_facility_id=None, requested_unit_id=None):
    return SimpleNamespace(
        created_by=created_by or uuid.uuid4(),
        preferred_facility_id=preferred_facility_id,
        accepted_facility_id=accepted_facility_id,
        requested_unit_id=requested_unit_id,
    )


class TestAssertCanApprove:
    def test_super_admin_may_always_approve(self):
        referral = make_referral()
        actor = make_actor(roles=("SUPER_ADMIN",))
        # No raise == allowed.
        service.assert_can_approve(referral, actor)

    def test_sender_cannot_approve_their_own_request(self):
        actor = make_actor()
        referral = make_referral(created_by=actor.id, preferred_facility_id=uuid.uuid4())
        with pytest.raises(ForbiddenError):
            service.assert_can_approve(referral, actor)

    def test_staff_at_another_facility_cannot_approve(self):
        facility = uuid.uuid4()
        referral = make_referral(preferred_facility_id=facility)
        actor = make_actor(active_facility_id=uuid.uuid4())  # different facility
        with pytest.raises(ForbiddenError):
            service.assert_can_approve(referral, actor)

    def test_facility_admin_at_destination_may_approve_any_unit(self):
        facility = uuid.uuid4()
        referral = make_referral(preferred_facility_id=facility, requested_unit_id=uuid.uuid4())
        # Admin is not a member of the requested unit, but the unit rule doesn't
        # apply to facility admins.
        actor = make_actor(roles=("FACILITY_ADMIN",), active_facility_id=facility, unit_ids=())
        service.assert_can_approve(referral, actor)

    def test_clinician_not_in_the_requested_unit_cannot_approve(self):
        facility = uuid.uuid4()
        referral = make_referral(preferred_facility_id=facility, requested_unit_id=uuid.uuid4())
        actor = make_actor(active_facility_id=facility, unit_ids=(uuid.uuid4(),))  # other unit
        with pytest.raises(ForbiddenError):
            service.assert_can_approve(referral, actor)

    def test_clinician_in_the_requested_unit_may_approve(self):
        facility, unit = uuid.uuid4(), uuid.uuid4()
        referral = make_referral(preferred_facility_id=facility, requested_unit_id=unit)
        actor = make_actor(active_facility_id=facility, unit_ids=(unit,))
        service.assert_can_approve(referral, actor)

    def test_facility_resolved_from_membership_when_no_active_facility(self):
        facility, unit = uuid.uuid4(), uuid.uuid4()
        referral = make_referral(preferred_facility_id=facility, requested_unit_id=unit)
        # No active_facility_id → fall back to the actor's facility memberships.
        actor = make_actor(active_facility_id=None, facilities=(facility,), unit_ids=(unit,))
        service.assert_can_approve(referral, actor)

    def test_request_with_no_destination_facility_cannot_be_approved(self):
        referral = make_referral(preferred_facility_id=None)
        actor = make_actor(active_facility_id=uuid.uuid4())
        with pytest.raises(ForbiddenError):
            service.assert_can_approve(referral, actor)


class TestAssertCanRecordArrival:
    def test_super_admin_may_always_record_arrival(self):
        referral = make_referral()
        actor = make_actor(roles=("SUPER_ADMIN",))
        service.assert_can_record_arrival(referral, actor)

    def test_sending_clinician_cannot_record_arrival(self):
        actor = make_actor()
        referral = make_referral(created_by=actor.id, accepted_facility_id=uuid.uuid4())
        with pytest.raises(ForbiddenError):
            service.assert_can_record_arrival(referral, actor)

    def test_receiving_facility_staff_may_record_arrival(self):
        facility = uuid.uuid4()
        referral = make_referral(accepted_facility_id=facility)
        actor = make_actor(active_facility_id=facility)
        service.assert_can_record_arrival(referral, actor)

    def test_falls_back_to_preferred_facility_when_not_yet_accepted(self):
        facility = uuid.uuid4()
        referral = make_referral(accepted_facility_id=None, preferred_facility_id=facility)
        actor = make_actor(active_facility_id=facility)
        service.assert_can_record_arrival(referral, actor)

    def test_staff_at_another_facility_cannot_record_arrival(self):
        referral = make_referral(accepted_facility_id=uuid.uuid4())
        actor = make_actor(active_facility_id=uuid.uuid4())
        with pytest.raises(ForbiddenError):
            service.assert_can_record_arrival(referral, actor)
