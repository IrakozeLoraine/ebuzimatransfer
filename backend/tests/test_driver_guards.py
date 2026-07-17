"""Guard rails on the driver phone-app endpoints: the journey steps must be taken
in order, the endpoints that need an active journey must say so, and a driver may
only act on calls they are actually a party to."""
import uuid

import pytest
import pytest_asyncio

from app.core.security import hash_password, create_driver_token
from app.models.ambulance import Ambulance
from app.models.facility import Facility
from app.models.referral import Referral
from app.models.resource import Resource
from app.models.incall import InAppCall, InAppCallStatus
from app.models.unit import Unit
from app.models.user import UserFacilityUnit

pytestmark = pytest.mark.asyncio

DRIVER = "/api/v1/driver"
TRANSPORT = "/api/v1/transport"


async def _make_ambulance(db_session, facility_id, *, plate):
    amb = Ambulance(
        facility_id=facility_id, plate_number=plate, login_id=plate,
        password_hash=hash_password("drive-pass"),
    )
    db_session.add(amb)
    await db_session.commit()
    return amb


def _driver_headers(amb):
    return {"Authorization": f"Bearer {create_driver_token(str(amb.id))}"}


@pytest_asyncio.fixture
async def assigned_journey(client, db_session, make_auth):
    """An ACCEPTED referral with an ambulance already assigned to it, so the driver
    has an active journey sitting at the ASSIGNED step."""
    from app.services.referral_service import ReferralService
    from app.schemas.referral import ReferralCreate, AcceptReferralRequest
    from types import SimpleNamespace

    admin = await make_auth(roles=("SUPER_ADMIN",))
    unit = Unit(name="ICU", tier="DISTRICT")
    db_session.add(unit)
    await db_session.flush()
    resource = Resource(
        resource_name="ICU Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=2
    )
    db_session.add(resource)
    await db_session.flush()

    svc = ReferralService(db_session)
    referral = await svc.create(
        ReferralCreate(
            sex="F", diagnosis="Sepsis", reason_for_transfer="ICU",
            preferred_facility_id=admin.facility.id, requested_unit_id=unit.id,
            requested_resource_ids=[resource.id],
        ),
        created_by=admin.user.id, referring_facility_id=admin.facility.id,
    )
    actor = SimpleNamespace(id=admin.user.id, effective_roles=["SUPER_ADMIN"],
                            active_facility_id=admin.facility.id, facilities=[], unit_ids=[])
    await svc.accept(referral.id, AcceptReferralRequest(), actor)
    await db_session.commit()

    amb = await _make_ambulance(db_session, admin.facility.id, plate="RAD-GUARD")
    await client.post(
        TRANSPORT, headers=admin.headers,
        json={"referral_id": str(referral.id), "ambulance_id": str(amb.id)},
    )
    return admin, referral, amb, _driver_headers(amb)


class TestJourneyStepOrder:
    async def test_starting_twice_conflicts(self, client, assigned_journey):
        _, _, _, headers = assigned_journey
        assert (await client.post(f"{DRIVER}/journey/start", headers=headers)).status_code == 200
        again = await client.post(f"{DRIVER}/journey/start", headers=headers)
        assert again.status_code == 409

    async def test_pickup_before_start_conflicts(self, client, assigned_journey):
        _, _, _, headers = assigned_journey
        resp = await client.post(f"{DRIVER}/journey/picked", headers=headers)
        assert resp.status_code == 409

    async def test_pickup_twice_conflicts(self, client, assigned_journey):
        _, _, _, headers = assigned_journey
        await client.post(f"{DRIVER}/journey/start", headers=headers)
        assert (await client.post(f"{DRIVER}/journey/picked", headers=headers)).status_code == 200
        again = await client.post(f"{DRIVER}/journey/picked", headers=headers)
        assert again.status_code == 409

    async def test_arrival_before_pickup_conflicts(self, client, assigned_journey):
        _, _, _, headers = assigned_journey
        await client.post(f"{DRIVER}/journey/start", headers=headers)
        resp = await client.post(f"{DRIVER}/journey/arrived", headers=headers)
        assert resp.status_code == 409


class TestJourneyRoutePoints:
    async def test_journey_carries_facility_coordinates(self, client, assigned_journey, db_session):
        admin, _, _, headers = assigned_journey
        facility = await db_session.get(Facility, admin.facility.id)
        facility.latitude, facility.longitude = -1.95, 30.06
        await db_session.commit()

        body = (await client.get(f"{DRIVER}/journey", headers=headers)).json()
        assert body["sending"]["latitude"] == -1.95
        assert body["receiving"]["longitude"] == 30.06

    async def test_journey_omits_route_points_without_coordinates(self, client, assigned_journey):
        # The fixture's facility has no lat/lng, so the driver app gets nulls rather
        # than half-populated points it would try to draw on the map.
        _, _, _, headers = assigned_journey
        body = (await client.get(f"{DRIVER}/journey", headers=headers)).json()
        assert body["sending"] is None and body["receiving"] is None


class TestWithoutActiveJourney:
    @pytest_asyncio.fixture
    async def idle_driver(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        amb = await _make_ambulance(db_session, admin.facility.id, plate="RAD-IDLE")
        return _driver_headers(amb)

    async def test_pings_are_empty(self, client, idle_driver):
        resp = await client.get(f"{DRIVER}/journey/pings", headers=idle_driver)
        assert resp.status_code == 200 and resp.json() == []

    async def test_monitorings_are_empty(self, client, idle_driver):
        resp = await client.get(f"{DRIVER}/journey/monitorings", headers=idle_driver)
        assert resp.status_code == 200 and resp.json() == []

    async def test_ping_is_rejected(self, client, idle_driver):
        resp = await client.post(
            f"{DRIVER}/journey/ping", headers=idle_driver,
            json={"latitude": -1.9, "longitude": 30.1},
        )
        assert resp.status_code == 409


class TestMonitoringUpload:
    async def test_oversized_recording_rejected(self, client, assigned_journey):
        _, _, _, headers = assigned_journey
        oversized = b"0" * (25 * 1024 * 1024 + 1)
        resp = await client.post(
            f"{DRIVER}/journey/monitoring", headers=headers,
            files={"audio": ("big.m4a", oversized, "audio/m4a")},
        )
        assert resp.status_code == 422


class TestReceivingNotification:
    async def test_start_journey_without_a_receiving_facility(self, client, assigned_journey, db_session):
        # A referral with no destination set has nobody on the receiving side to
        # notify; starting the journey must still succeed rather than blow up.
        _, referral, _, headers = assigned_journey
        row = await db_session.get(Referral, referral.id)
        row.accepted_facility_id = None
        row.preferred_facility_id = None
        await db_session.commit()

        resp = await client.post(f"{DRIVER}/journey/start", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["receiving"] is None


class TestDriverCalls:
    async def test_call_for_unknown_referral_not_found(self, client, assigned_journey):
        _, _, _, headers = assigned_journey
        resp = await client.post(
            f"{DRIVER}/calls", headers=headers,
            json={"referral_id": str(uuid.uuid4()), "side": "receiving"},
        )
        assert resp.status_code == 404

    async def test_call_with_nobody_in_the_unit_is_recorded_as_missed(
        self, client, assigned_journey, db_session
    ):
        # Nobody works in the destination unit, so there is no one to ring. The
        # attempt is still logged as a MISSED call for the record.
        _, referral, amb, headers = assigned_journey
        resp = await client.post(
            f"{DRIVER}/calls", headers=headers,
            json={"referral_id": str(referral.id), "side": "receiving"},
        )
        assert resp.status_code == 422

        from sqlalchemy import select

        call = await db_session.scalar(
            select(InAppCall).where(InAppCall.caller_ambulance_id == amb.id)
        )
        assert call.status == InAppCallStatus.MISSED
        assert call.ended_at is not None

    async def test_call_to_referring_side_rings_that_unit(
        self, client, assigned_journey, db_session, make_auth
    ):
        _, referral, amb, headers = assigned_journey
        row = await db_session.get(Referral, referral.id)
        unit = Unit(name="Maternity", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        row.origin_unit_id = unit.id
        clinician = await make_auth(roles=("CLINICIAN",))
        db_session.add(
            UserFacilityUnit(
                user_id=clinician.user.id,
                facility_id=row.referring_facility_id,
                unit_id=unit.id,
            )
        )
        await db_session.commit()

        resp = await client.post(
            f"{DRIVER}/calls", headers=headers,
            json={"referral_id": str(referral.id), "side": "referring"},
        )
        assert resp.status_code == 201
        assert resp.json()["caller_ambulance_id"] == str(amb.id)


class TestDriverCallMembership:
    @pytest_asyncio.fixture
    async def foreign_call(self, db_session, make_auth):
        """A call between two other parties, plus an outsider ambulance's headers."""
        caller = await make_auth(roles=("CLINICIAN",))
        other_amb = await _make_ambulance(db_session, caller.facility.id, plate="RAD-PARTY")
        call = InAppCall(
            caller_id=caller.user.id,
            callee_ambulance_id=other_amb.id,
            callee_facility_id=caller.facility.id,
            status=InAppCallStatus.RINGING,
        )
        db_session.add(call)
        outsider = await _make_ambulance(db_session, caller.facility.id, plate="RAD-OUT")
        await db_session.commit()
        return call, _driver_headers(outsider)

    async def test_answering_someone_elses_call_forbidden(self, client, foreign_call):
        call, outsider = foreign_call
        resp = await client.post(f"{DRIVER}/calls/{call.id}/answer", headers=outsider)
        assert resp.status_code == 403

    async def test_ending_a_call_youre_not_on_forbidden(self, client, foreign_call):
        call, outsider = foreign_call
        resp = await client.post(f"{DRIVER}/calls/{call.id}/end", headers=outsider)
        assert resp.status_code == 403

    async def test_signalling_on_a_call_youre_not_on_forbidden(self, client, foreign_call):
        call, outsider = foreign_call
        resp = await client.post(
            f"{DRIVER}/calls/{call.id}/signal", headers=outsider,
            json={"kind": "offer", "data": {"sdp": "x"}},
        )
        assert resp.status_code == 403
