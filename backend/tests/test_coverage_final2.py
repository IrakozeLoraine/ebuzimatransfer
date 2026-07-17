"""Second targeted coverage pass: remaining dictation JSON-shape branches,
NotificationService fan-out helpers, the live-tracking ETA path, transport
error/guard paths, and request-helper utilities."""
import json
import uuid

import pytest
import pytest_asyncio

import app.services.dictation_service as ds
from app.services.dictation_service import DictationService
from app.core.exceptions import ValidationError
from app.core.security import hash_password, create_driver_token
from app.models.unit import Unit
from app.models.resource import Resource
from app.models.facility import Facility
from app.models.ambulance import Ambulance, AmbulanceLocationPing
from app.models.user import UserFacilityUnit
from app.services.notification_service import NotificationService

pytestmark = pytest.mark.asyncio


def _fake_httpx(content=None, exc=None):
    class _Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"message": {"content": content}}

    class _Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            if exc:
                raise exc
            return _Resp()

    return _Client


class TestDictationEdgeShapes:
    async def test_form_data_non_object_json_returns_empty(self, monkeypatch):
        # Ollama returns valid JSON that isn't an object → {}.
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx("[1, 2, 3]"))
        out = await DictationService()._extract_form_data("t", [{"name": "a", "kind": "text"}])
        assert out == {}

    async def test_form_data_numeric_value_stringified(self, monkeypatch):
        payload = json.dumps({"age": 42})
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx(payload))
        out = await DictationService()._extract_form_data("t", [{"name": "age", "kind": "text"}])
        assert out["age"] == "42"

    async def test_monitoring_skips_non_dict_rows(self, monkeypatch):
        payload = json.dumps({
            "summary": "ok",
            "vital_signs": ["not-a-dict", {"time": "10:00", "bp": "", "temp": "", "spo2": "",
                                            "rr": "", "pulse": "", "fhr": "", "membranes_ruptured": ""}],
            "problems": [],
        })
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx(payload))
        summary, vitals, problems = await DictationService()._extract_monitoring("t")
        assert len(vitals) == 1  # the string row was skipped

    async def test_monitoring_empty_transcript_rejected(self, monkeypatch):
        monkeypatch.setattr(ds, "_transcribe_sync", lambda b: "")
        with pytest.raises(ValidationError):
            await DictationService().transcribe_monitoring(b"audio", "m.m4a")


class TestNotificationFanout:
    async def test_broadcast_event(self, db_session, make_auth):
        await make_auth(roles=("CLINICIAN",))
        # Just exercises the channel broadcast helper (local no-op without sockets).
        await NotificationService(db_session).broadcast_event("PING", {"x": 1})

    async def test_notify_role_scoped_to_facility(self, db_session, make_auth):
        target = await make_auth(roles=("FACILITY_ADMIN",))
        svc = NotificationService(db_session)
        await svc.notify_role("FACILITY_ADMIN", "T", "M", facility_id=target.facility.id)
        await db_session.commit()
        notes = await svc.list_for_user(target.user.id)
        assert any(n.title == "T" for n in notes)

    async def test_notify_facility_unit_excludes_caller(self, db_session, make_auth):
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        member = await make_auth(roles=("CLINICIAN",))
        db_session.add(UserFacilityUnit(user_id=member.user.id, facility_id=member.facility.id, unit_id=unit.id))
        await db_session.commit()
        svc = NotificationService(db_session)
        # Excluding the only member means nobody is notified.
        await svc.notify_facility_unit(
            member.facility.id, unit.id, "CLINICIAN", "T", "M", exclude_user_id=member.user.id
        )
        await db_session.commit()
        assert await svc.list_for_user(member.user.id) == []

    async def test_notify_role_excludes_super_admins(self, db_session, make_auth):
        # A user who is both a clinician and a system admin must not receive
        # operational referral notifications; a plain clinician still does.
        both = await make_auth(roles=("CLINICIAN", "SUPER_ADMIN"))
        plain = await make_auth(roles=("CLINICIAN",))
        svc = NotificationService(db_session)
        await svc.notify_role("CLINICIAN", "New request", "body")
        await db_session.commit()
        assert await svc.list_for_user(both.user.id) == []
        assert any(n.title == "New request" for n in await svc.list_for_user(plain.user.id))

    async def test_notify_facility_unit_excludes_super_admins(self, db_session, make_auth):
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        admin = await make_auth(roles=("CLINICIAN", "SUPER_ADMIN"))
        db_session.add(UserFacilityUnit(user_id=admin.user.id, facility_id=admin.facility.id, unit_id=unit.id))
        await db_session.commit()
        svc = NotificationService(db_session)
        await svc.notify_facility_unit(admin.facility.id, unit.id, "CLINICIAN", "T", "M")
        await db_session.commit()
        assert await svc.list_for_user(admin.user.id) == []


class TestTrackingEta:
    async def test_track_eta_from_latest_ping(self, client, db_session, make_auth, monkeypatch):
        from app.services.referral_service import ReferralService
        from app.schemas.referral import ReferralCreate

        admin = await make_auth(roles=("SUPER_ADMIN",))
        facility = await db_session.get(Facility, admin.facility.id)
        facility.latitude, facility.longitude = -1.95, 30.06
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        res = Resource(resource_name="Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=1)
        db_session.add(res)
        await db_session.flush()
        referral = await ReferralService(db_session).create(
            ReferralCreate(sex="M", diagnosis="d", reason_for_transfer="r",
                           preferred_facility_id=admin.facility.id, requested_unit_id=unit.id,
                           requested_resource_ids=[res.id]),
            created_by=admin.user.id, referring_facility_id=admin.facility.id,
        )
        # A GPS ping so the ETA is computed from the live position, not the plan.
        db_session.add(AmbulanceLocationPing(referral_id=referral.id, latitude=-1.9, longitude=30.1))
        await db_session.commit()

        from types import SimpleNamespace

        async def fake_route(lat1, lng1, lat2, lng2):
            return SimpleNamespace(geometry=[(-1.95, 30.06), (-1.9, 30.1)], duration_s=420)

        monkeypatch.setattr("app.api.ambulance.road_route", fake_route)
        resp = await client.get(f"/api/v1/ambulance/{referral.id}/track", headers=admin.headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["estimated_arrival_time"] is not None
        assert body["latest"] is not None


class TestTransportGuards:
    @pytest_asyncio.fixture
    async def clinician_referral(self, db_session, make_auth):
        """A referral created by a CLINICIAN (so they're the referring side) and
        accepted by a super admin — ready for transport decisions."""
        from app.services.referral_service import ReferralService
        from app.schemas.referral import ReferralCreate, AcceptReferralRequest
        from types import SimpleNamespace

        clinician = await make_auth(roles=("CLINICIAN",))
        approver = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        db_session.add(UserFacilityUnit(user_id=clinician.user.id, facility_id=clinician.facility.id, unit_id=unit.id))
        res = Resource(resource_name="Bed", facility_id=clinician.facility.id, unit_id=unit.id, quantity=1)
        db_session.add(res)
        await db_session.flush()
        svc = ReferralService(db_session)
        referral = await svc.create(
            ReferralCreate(sex="M", diagnosis="d", reason_for_transfer="r",
                           preferred_facility_id=clinician.facility.id, requested_unit_id=unit.id,
                           requested_resource_ids=[res.id]),
            created_by=clinician.user.id, referring_facility_id=clinician.facility.id, origin_unit_id=unit.id,
        )
        admin_actor = SimpleNamespace(id=approver.user.id, effective_roles=["SUPER_ADMIN"],
                                      active_facility_id=None, facilities=[], unit_ids=[])
        await svc.accept(referral.id, AcceptReferralRequest(), admin_actor)
        await db_session.commit()
        return clinician, referral

    async def test_remove_transport_unknown_referral(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.delete(f"/api/v1/transport/{uuid.uuid4()}", headers=admin.headers)
        assert resp.status_code == 404

    async def test_dispatch_foreign_ambulance_forbidden(self, client, clinician_referral, db_session, make_auth):
        clinician, referral = clinician_referral
        # An ambulance owned by a *different* facility than the referring clinician's.
        other = await make_auth(roles=("SUPER_ADMIN",))
        amb = Ambulance(facility_id=other.facility.id, plate_number="RAD-FGN", login_id="RAD-FGN",
                        password_hash=hash_password("x"))
        db_session.add(amb)
        await db_session.commit()
        resp = await client.post(
            "/api/v1/transport", headers=clinician.headers,
            json={"referral_id": str(referral.id), "ambulance_id": str(amb.id)},
        )
        assert resp.status_code == 403

    async def test_remove_after_journey_started_conflicts(self, client, clinician_referral, db_session):
        clinician, referral = clinician_referral
        amb = Ambulance(facility_id=clinician.facility.id, plate_number="RAD-GO", login_id="RAD-GO",
                        password_hash=hash_password("x"))
        db_session.add(amb)
        await db_session.commit()
        # Arrange transport, then the driver starts the journey (sets dispatch_time).
        await client.post(
            "/api/v1/transport", headers=clinician.headers,
            json={"referral_id": str(referral.id), "ambulance_id": str(amb.id)},
        )
        driver = {"Authorization": f"Bearer {create_driver_token(str(amb.id))}"}
        await client.post("/api/v1/driver/journey/start", headers=driver)
        # Now the ambulance can no longer be removed.
        resp = await client.delete(f"/api/v1/transport/{referral.id}", headers=clinician.headers)
        assert resp.status_code == 409


class TestRequestHelpers:
    async def test_forwarded_for_header_is_used(self, client, make_auth):
        # Login writes an audit row via get_client_ip; an X-Forwarded-For header
        # exercises the proxy branch of that helper.
        await make_auth(roles=("CLINICIAN",), medical_id="MED-XFF", password="S3cret-pass")
        resp = await client.post(
            "/api/v1/auth/login",
            json={"medical_id": "MED-XFF", "password": "S3cret-pass"},
            headers={"X-Forwarded-For": "203.0.113.9, 10.0.0.1"},
        )
        assert resp.status_code == 200
