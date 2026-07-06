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


def make_actor(
    *, roles=("CLINICIAN",), id=None, active_facility_id=None, facilities=(), unit_ids=(), facility_units=()
):
    # ``facility_units`` models real (facility, unit) memberships — units are a
    # global catalog, so which facility a unit membership belongs to matters.
    fus = [SimpleNamespace(facility_id=f, unit_id=u) for f, u in facility_units]
    actor = SimpleNamespace(
        effective_roles=list(roles),
        id=id or uuid.uuid4(),
        active_facility_id=active_facility_id,
        facilities=[SimpleNamespace(id=f) for f in facilities],
        unit_ids=list(unit_ids),
        facility_units=fus,
    )
    actor.units_for_facility = lambda fid: [fu for fu in fus if fu.facility_id == fid]
    return actor


def make_referral(
    *,
    created_by=None,
    preferred_facility_id=None,
    accepted_facility_id=None,
    requested_unit_id=None,
    referring_facility_id=None,
    origin_unit_id=None,
):
    return SimpleNamespace(
        created_by=created_by or uuid.uuid4(),
        preferred_facility_id=preferred_facility_id,
        accepted_facility_id=accepted_facility_id,
        requested_unit_id=requested_unit_id,
        referring_facility_id=referring_facility_id,
        origin_unit_id=origin_unit_id,
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


class TestAssertCanArrangeTransport:
    def test_super_admin_may_always_arrange_transport(self):
        referral = make_referral()
        actor = make_actor(roles=("SUPER_ADMIN",))
        service.assert_can_arrange_transport(referral, actor)

    def test_sending_clinician_may_arrange_transport(self):
        actor = make_actor()
        referral = make_referral(created_by=actor.id)
        service.assert_can_arrange_transport(referral, actor)

    def test_referring_facility_staff_may_arrange_transport(self):
        facility = uuid.uuid4()
        referral = make_referral(referring_facility_id=facility)
        actor = make_actor(active_facility_id=facility)
        service.assert_can_arrange_transport(referral, actor)

    def test_origin_unit_staff_at_referring_facility_may_arrange_transport(self):
        referring, unit = uuid.uuid4(), uuid.uuid4()
        referral = make_referral(referring_facility_id=referring, origin_unit_id=unit)
        actor = make_actor(active_facility_id=uuid.uuid4(), facility_units=((referring, unit),))
        service.assert_can_arrange_transport(referral, actor)

    def test_origin_unit_membership_elsewhere_cannot_arrange_transport(self):
        referring, receiving = uuid.uuid4(), uuid.uuid4()
        unit = uuid.uuid4()  # shared catalog unit — both origin and requested
        referral = make_referral(
            referring_facility_id=referring,
            accepted_facility_id=receiving,
            preferred_facility_id=receiving,
            origin_unit_id=unit,
            requested_unit_id=unit,
        )
        actor = make_actor(
            active_facility_id=receiving, unit_ids=(unit,), facility_units=((receiving, unit),)
        )
        with pytest.raises(ForbiddenError):
            service.assert_can_arrange_transport(referral, actor)

    def test_receiving_facility_cannot_arrange_transport(self):
        # Staff at the destination (accepted/preferred) facility must not arrange
        # transport — that's the referring side's job.
        receiving = uuid.uuid4()
        referral = make_referral(
            referring_facility_id=uuid.uuid4(),
            accepted_facility_id=receiving,
            preferred_facility_id=receiving,
        )
        actor = make_actor(active_facility_id=receiving)
        with pytest.raises(ForbiddenError):
            service.assert_can_arrange_transport(referral, actor)

    def test_unrelated_facility_cannot_arrange_transport(self):
        referral = make_referral(referring_facility_id=uuid.uuid4())
        actor = make_actor(active_facility_id=uuid.uuid4())
        with pytest.raises(ForbiddenError):
            service.assert_can_arrange_transport(referral, actor)
