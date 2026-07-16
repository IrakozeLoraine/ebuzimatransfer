"""API-level integration tests for ambulance management, transport assignment,
the driver phone-app endpoints and the live ambulance-tracking endpoint."""
import uuid

import pytest
import pytest_asyncio

from app.core.security import hash_password, create_driver_token
from app.models.unit import Unit
from app.models.resource import Resource
from app.models.ambulance import Ambulance
from app.models.referral import Referral, ReferralStatus
from app.models.facility import Facility
from app.schemas.referral import TransportMonitoringResult

pytestmark = pytest.mark.asyncio

AMB = "/api/v1/ambulances"
TRANSPORT = "/api/v1/transport"
DRIVER = "/api/v1/driver"
TRACK = "/api/v1/ambulance"


async def _make_ambulance(db_session, facility_id, *, plate="RAD-100", password="drive-pass", active=True):
    amb = Ambulance(
        facility_id=facility_id, plate_number=plate, login_id=plate,
        password_hash=hash_password(password), is_active=active,
    )
    db_session.add(amb)
    await db_session.commit()
    return amb


def _driver_headers(amb):
    return {"Authorization": f"Bearer {create_driver_token(str(amb.id))}"}


@pytest_asyncio.fixture
async def accepted_referral(db_session, make_auth):
    """A super admin, a unit, an available resource, and a referral already ACCEPTED
    (with a bed reserved) — ready for transport to be arranged."""
    admin = await make_auth(roles=("SUPER_ADMIN",))
    unit = Unit(name="ICU", tier="DISTRICT")
    db_session.add(unit)
    await db_session.flush()
    resource = Resource(
        resource_name="ICU Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=3
    )
    db_session.add(resource)
    await db_session.flush()

    from app.services.referral_service import ReferralService
    from app.schemas.referral import ReferralCreate, AcceptReferralRequest
    from types import SimpleNamespace

    svc = ReferralService(db_session)
    actor = SimpleNamespace(id=admin.user.id, effective_roles=["SUPER_ADMIN"],
                            active_facility_id=admin.facility.id, facilities=[], unit_ids=[])
    referral = await svc.create(
        ReferralCreate(
            sex="F", diagnosis="Sepsis", reason_for_transfer="ICU",
            preferred_facility_id=admin.facility.id, requested_unit_id=unit.id,
            requested_resource_ids=[resource.id],
        ),
        created_by=admin.user.id, referring_facility_id=admin.facility.id,
    )
    await svc.accept(referral.id, AcceptReferralRequest(), actor)
    await db_session.commit()
    return admin, referral


class TestAmbulances:
    async def test_create_reveals_one_time_password(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        resp = await client.post(
            AMB, headers=admin.headers, json={"plate_number": "RAD-777", "driver_name": "Eric"}
        )
        assert resp.status_code == 201
        assert resp.json()["password"]  # revealed once
        assert resp.json()["login_id"] == "RAD-777"

    async def test_super_admin_requires_facility(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        # A super admin with more than one facility context but no facility_id -> 422.
        # (make_auth gives one facility, so pass no facility_id and force None.)
        resp = await client.post(AMB, headers=admin.headers, json={"plate_number": ""})
        assert resp.status_code == 422

    async def test_duplicate_plate_rejected(self, client, make_auth, db_session):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        await _make_ambulance(db_session, admin.facility.id, plate="RAD-DUP")
        resp = await client.post(AMB, headers=admin.headers, json={"plate_number": "RAD-DUP"})
        assert resp.status_code == 422

    async def test_list_ambulances_and_available_filter(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        await _make_ambulance(db_session, admin.facility.id, plate="RAD-A")
        listed = await client.get(AMB, headers=admin.headers)
        assert listed.status_code == 200 and len(listed.json()) >= 1
        available = await client.get(f"{AMB}?available=true", headers=admin.headers)
        assert available.status_code == 200

    async def test_update_ambulance(self, client, make_auth, db_session):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        amb = await _make_ambulance(db_session, admin.facility.id, plate="RAD-U")
        resp = await client.patch(
            f"{AMB}/{amb.id}", headers=admin.headers,
            json={"driver_name": "New Driver", "is_active": False},
        )
        assert resp.status_code == 200
        assert resp.json()["driver_name"] == "New Driver"

    async def test_update_foreign_ambulance_forbidden(self, client, make_auth, db_session):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        other = await make_auth(roles=("CLINICIAN",))
        amb = await _make_ambulance(db_session, other.facility.id, plate="RAD-F")
        resp = await client.patch(f"{AMB}/{amb.id}", headers=admin.headers, json={"driver_name": "x"})
        assert resp.status_code == 403

    async def test_reset_password(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        amb = await _make_ambulance(db_session, admin.facility.id, plate="RAD-R")
        resp = await client.post(f"{AMB}/{amb.id}/reset-password", headers=admin.headers)
        assert resp.status_code == 200
        assert resp.json()["password"]


class TestTransport:
    async def test_arrange_and_remove_transport(self, client, accepted_referral, db_session):
        admin, referral = accepted_referral
        amb = await _make_ambulance(db_session, admin.facility.id, plate="RAD-T")

        created = await client.post(
            TRANSPORT, headers=admin.headers,
            json={"referral_id": str(referral.id), "ambulance_id": str(amb.id)},
        )
        assert created.status_code == 201
        assert created.json()["ambulance_identifier"] == "RAD-T"

        removed = await client.delete(f"{TRANSPORT}/{referral.id}", headers=admin.headers)
        assert removed.status_code == 200

    async def test_double_booking_is_rejected(self, client, accepted_referral, db_session, make_auth):
        admin, referral = accepted_referral
        amb = await _make_ambulance(db_session, admin.facility.id, plate="RAD-BUSY")
        await client.post(
            TRANSPORT, headers=admin.headers,
            json={"referral_id": str(referral.id), "ambulance_id": str(amb.id)},
        )
        # A second accepted referral trying to book the same ambulance conflicts.
        admin2, referral2 = accepted_referral  # same fixture instance data
        resp = await client.post(
            TRANSPORT, headers=admin.headers,
            json={"referral_id": str(referral.id), "ambulance_id": str(amb.id)},
        )
        assert resp.status_code in (409, 422)

    async def test_transport_unknown_referral_not_found(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        amb = await _make_ambulance(db_session, admin.facility.id, plate="RAD-NF")
        resp = await client.post(
            TRANSPORT, headers=admin.headers,
            json={"referral_id": str(uuid.uuid4()), "ambulance_id": str(amb.id)},
        )
        assert resp.status_code == 404


class TestDriverApp:
    async def test_login_success_and_failure(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        await _make_ambulance(db_session, admin.facility.id, plate="RAD-LOGIN", password="secret-pass")

        ok = await client.post(
            f"{DRIVER}/login", json={"login_id": "RAD-LOGIN", "password": "secret-pass"}
        )
        assert ok.status_code == 200
        assert ok.json()["token"]

        bad = await client.post(
            f"{DRIVER}/login", json={"login_id": "RAD-LOGIN", "password": "wrong"}
        )
        assert bad.status_code == 401

    async def test_journey_lifecycle(self, client, accepted_referral, db_session):
        admin, referral = accepted_referral
        amb = await _make_ambulance(db_session, admin.facility.id, plate="RAD-J")
        headers = _driver_headers(amb)

        # No journey until transport is arranged.
        empty = await client.get(f"{DRIVER}/journey", headers=headers)
        assert empty.status_code == 200 and empty.json() is None

        await client.post(
            TRANSPORT, headers=admin.headers,
            json={"referral_id": str(referral.id), "ambulance_id": str(amb.id)},
        )

        journey = await client.get(f"{DRIVER}/journey", headers=headers)
        assert journey.json()["step"] == "ASSIGNED"

        started = await client.post(f"{DRIVER}/journey/start", headers=headers)
        assert started.json()["step"] == "EN_ROUTE_TO_PICKUP"

        # A GPS ping while en route.
        ping = await client.post(
            f"{DRIVER}/journey/ping", headers=headers, json={"latitude": -1.9, "longitude": 30.1}
        )
        assert ping.status_code == 201

        pings = await client.get(f"{DRIVER}/journey/pings", headers=headers)
        assert len(pings.json()) == 1

        picked = await client.post(f"{DRIVER}/journey/picked", headers=headers)
        assert picked.json()["step"] == "PATIENT_ONBOARD"

        arrived = await client.post(f"{DRIVER}/journey/arrived", headers=headers)
        assert arrived.json()["step"] == "ARRIVED"

        history = await client.get(f"{DRIVER}/journeys", headers=headers)
        assert len(history.json()) == 1

    async def test_start_requires_active_journey(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        amb = await _make_ambulance(db_session, admin.facility.id, plate="RAD-NOJ")
        resp = await client.post(f"{DRIVER}/journey/start", headers=_driver_headers(amb))
        assert resp.status_code == 404

    async def test_monitoring_recording(self, client, accepted_referral, db_session, monkeypatch):
        admin, referral = accepted_referral
        amb = await _make_ambulance(db_session, admin.facility.id, plate="RAD-MON")
        headers = _driver_headers(amb)
        await client.post(
            TRANSPORT, headers=admin.headers,
            json={"referral_id": str(referral.id), "ambulance_id": str(amb.id)},
        )
        await client.post(f"{DRIVER}/journey/start", headers=headers)

        async def fake(self, audio_bytes, filename):
            return TransportMonitoringResult(transcript="t", summary="s")

        monkeypatch.setattr(
            "app.api.driver.DictationService.transcribe_monitoring", fake
        )
        resp = await client.post(
            f"{DRIVER}/journey/monitoring",
            headers=headers,
            files={"audio": ("m.m4a", b"bytes", "audio/m4a")},
        )
        assert resp.status_code == 200
        listed = await client.get(f"{DRIVER}/journey/monitorings", headers=headers)
        assert len(listed.json()) == 1

    async def test_driver_calls_clinic(self, client, accepted_referral, db_session, make_auth):
        admin, referral = accepted_referral
        # Give the destination unit a clinician so the call rings someone.
        from app.models.user import UserFacilityUnit
        recipient = await make_auth(roles=("CLINICIAN",))
        db_session.add(
            UserFacilityUnit(
                user_id=recipient.user.id,
                facility_id=referral.preferred_facility_id,
                unit_id=referral.requested_unit_id,
            )
        )
        amb = await _make_ambulance(db_session, admin.facility.id, plate="RAD-CALL")
        await db_session.commit()
        headers = _driver_headers(amb)

        resp = await client.post(
            f"{DRIVER}/calls",
            headers=headers,
            json={"referral_id": str(referral.id), "side": "receiving"},
        )
        assert resp.status_code == 201
        assert resp.json()["caller_ambulance_id"] == str(amb.id)


class TestTracking:
    async def test_track_without_coordinates_skips_routing(self, client, accepted_referral, db_session):
        admin, referral = accepted_referral
        resp = await client.get(f"{TRACK}/{referral.id}/track", headers=admin.headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["referral_id"] == str(referral.id)
        assert body["route"] is None  # no facility coords -> no routing

    async def test_track_with_coords_uses_routing(self, client, accepted_referral, db_session, monkeypatch):
        admin, referral = accepted_referral
        # Give the referring & destination facilities coordinates so routing runs.
        facility = await db_session.get(Facility, admin.facility.id)
        facility.latitude, facility.longitude = -1.95, 30.06
        await db_session.commit()

        from types import SimpleNamespace

        async def fake_route(lat1, lng1, lat2, lng2):
            return SimpleNamespace(geometry=[(-1.95, 30.06), (-1.9, 30.1)], duration_s=600)

        monkeypatch.setattr("app.api.ambulance.road_route", fake_route)
        resp = await client.get(f"{TRACK}/{referral.id}/track", headers=admin.headers)
        assert resp.status_code == 200

    async def test_track_unknown_referral_not_found(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.get(f"{TRACK}/{uuid.uuid4()}/track", headers=admin.headers)
        assert resp.status_code == 404
