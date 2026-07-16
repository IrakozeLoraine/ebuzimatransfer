"""API-level integration tests for the referrals endpoints, driving the full
create → accept/reject → transport → arrival lifecycle over ASGI. A SUPER_ADMIN
actor is used so the tests exercise the endpoint wiring, notifications and
websocket broadcasts rather than re-testing the permission rules (covered in the
service-level tests)."""
import uuid

import pytest
import pytest_asyncio

from app.models.unit import Unit
from app.models.resource import Resource
from app.schemas.referral import DictationResult, DictationFields

pytestmark = pytest.mark.asyncio

API = "/api/v1/referrals"


@pytest_asyncio.fixture
async def env(db_session, make_auth):
    """A super admin plus a unit and an available resource at their facility, so a
    self-referral can be created and driven through its lifecycle."""
    admin = await make_auth(roles=("SUPER_ADMIN",))
    unit = Unit(name="ICU", tier="DISTRICT")
    db_session.add(unit)
    await db_session.flush()
    resource = Resource(
        resource_name="ICU Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=5
    )
    db_session.add(resource)
    await db_session.commit()
    return admin, unit, resource


def _payload(env):
    admin, unit, resource = env
    return {
        "sex": "F",
        "diagnosis": "Severe sepsis",
        "reason_for_transfer": "Requires ICU care",
        "preferred_facility_id": str(admin.facility.id),
        "requested_unit_id": str(unit.id),
        "requested_resource_ids": [str(resource.id)],
    }


async def _create(client, env):
    admin, _, _ = env
    resp = await client.post(API, headers=admin.headers, json=_payload(env))
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestCreateList:
    async def test_create_referral(self, client, env):
        body = await _create(client, env)
        assert body["status"] == "REQUESTED"
        assert body["referral_number"]

    async def test_create_requires_clinical_role(self, client, make_auth, env):
        admin, unit, resource = env
        fac_admin = await make_auth(roles=("FACILITY_ADMIN",))
        resp = await client.post(API, headers=fac_admin.headers, json=_payload(env))
        assert resp.status_code == 403

    async def test_create_rejects_resource_at_other_facility(self, client, make_auth, env, db_session):
        admin, unit, resource = env
        other = await make_auth(roles=("CLINICIAN",))
        stray = Resource(resource_name="Bed", facility_id=other.facility.id, unit_id=unit.id, quantity=1)
        db_session.add(stray)
        await db_session.commit()
        payload = _payload(env)
        payload["requested_resource_ids"] = [str(stray.id)]
        resp = await client.post(API, headers=admin.headers, json=payload)
        assert resp.status_code == 422

    async def test_list_referrals(self, client, env):
        await _create(client, env)
        admin, _, _ = env
        resp = await client.get(API, headers=admin.headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_get_referral(self, client, env):
        body = await _create(client, env)
        admin, _, _ = env
        resp = await client.get(f"{API}/{body['id']}", headers=admin.headers)
        assert resp.status_code == 200

    async def test_get_unknown_referral_is_not_found(self, client, env):
        admin, _, _ = env
        resp = await client.get(f"{API}/{uuid.uuid4()}", headers=admin.headers)
        assert resp.status_code == 404


class TestDraftAndForm:
    async def test_create_draft_and_complete_form(self, client, env):
        admin, unit, resource = env
        draft = await client.post(
            f"{API}/draft",
            headers=admin.headers,
            json={
                "preferred_facility_id": str(admin.facility.id),
                "requested_unit_id": str(unit.id),
                "requested_resource_ids": [str(resource.id)],
            },
        )
        assert draft.status_code == 201
        assert draft.json()["status"] == "DRAFT"

        completed = await client.patch(
            f"{API}/{draft.json()['id']}",
            headers=admin.headers,
            json={"diagnosis": "Updated dx", "form_type": "EXTERNAL"},
        )
        assert completed.status_code == 200
        assert completed.json()["diagnosis"] == "Updated dx"


class TestAcceptReject:
    async def test_accept_referral(self, client, env):
        body = await _create(client, env)
        admin, _, _ = env
        resp = await client.post(f"{API}/{body['id']}/accept", headers=admin.headers, json={})
        assert resp.status_code == 200
        assert resp.json()["status"] == "ACCEPTED"

    async def test_quick_accept_referral(self, client, env):
        body = await _create(client, env)
        admin, _, _ = env
        resp = await client.post(f"{API}/{body['id']}/quick-accept", headers=admin.headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "ACCEPTED"

    async def test_reject_referral(self, client, env):
        body = await _create(client, env)
        admin, _, _ = env
        resp = await client.post(
            f"{API}/{body['id']}/reject",
            headers=admin.headers,
            json={"reason": "No beds", "comment": "Try CHUK"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "REJECTED"

    async def test_update_status_query(self, client, env):
        body = await _create(client, env)
        admin, _, _ = env
        resp = await client.patch(
            f"{API}/{body['id']}/status?status=UNDER_REVIEW", headers=admin.headers
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "UNDER_REVIEW"


class TestArrival:
    async def test_mark_arrived_condition_and_feedback(self, client, env):
        body = await _create(client, env)
        admin, _, _ = env
        rid = body["id"]
        await client.post(f"{API}/{rid}/accept", headers=admin.headers, json={})

        arrived = await client.post(f"{API}/{rid}/mark-arrived", headers=admin.headers)
        assert arrived.status_code == 200
        assert arrived.json()["status"] == "ARRIVED"

        cond = await client.post(
            f"{API}/{rid}/arrival-condition",
            headers=admin.headers,
            json={"arrival_condition": "STABLE"},
        )
        assert cond.status_code == 200

        feedback = await client.patch(
            f"{API}/{rid}/feedback",
            headers=admin.headers,
            json={"feedback_data": {"outcome": "admitted"}},
        )
        assert feedback.status_code == 200


class TestTranscribeAndAudio:
    async def test_transcribe_uses_dictation_service(self, client, make_auth, monkeypatch):
        admin = await make_auth(roles=("CLINICIAN",))

        async def fake(self, audio_bytes, filename, form_spec=None):
            assert form_spec == ["patient_name"]
            return DictationResult(transcript="hello", summary="short", fields=DictationFields(sex="F"))

        monkeypatch.setattr(
            "app.api.referrals.DictationService.transcribe_to_form", fake
        )
        resp = await client.post(
            f"{API}/transcribe",
            headers=admin.headers,
            data={"form_spec": '["patient_name"]'},
            files={"audio": ("rec.webm", b"audio-bytes", "audio/webm")},
        )
        assert resp.status_code == 200
        assert resp.json()["transcript"] == "hello"

    async def test_transcribe_ignores_malformed_form_spec(self, client, make_auth, monkeypatch):
        admin = await make_auth(roles=("CLINICIAN",))

        async def fake(self, audio_bytes, filename, form_spec=None):
            assert form_spec is None  # malformed spec falls back to None
            return DictationResult(transcript="t", summary="s", fields=DictationFields())

        monkeypatch.setattr("app.api.referrals.DictationService.transcribe_to_form", fake)
        resp = await client.post(
            f"{API}/transcribe",
            headers=admin.headers,
            data={"form_spec": "{not json"},
            files={"audio": ("rec.webm", b"x", "audio/webm")},
        )
        assert resp.status_code == 200

    async def test_missing_audio_recording_is_not_found(self, client):
        resp = await client.get(f"{API}/audio/{uuid.uuid4()}.webm")
        assert resp.status_code == 404

    async def test_missing_monitoring_recording_is_not_found(self, client):
        resp = await client.get(f"{API}/monitoring-audio/{uuid.uuid4()}.webm")
        assert resp.status_code == 404
