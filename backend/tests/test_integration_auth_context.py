"""Integration tests for facility/unit *working context*: the active unit carried in
the token, its unambiguous auto-selection at login, and the switch-context endpoint.
"""
import uuid

import pytest

from app.models.unit import Unit
from app.models.user import UserFacilityUnit

pytestmark = pytest.mark.asyncio

API = "/api/v1/auth"


async def _add_unit(db_session, user, facility, name: str, tier: str = "DISTRICT") -> Unit:
    """Seed a clinical unit and enrol the user in it at the given facility."""
    unit = Unit(name=name, tier=tier)
    db_session.add(unit)
    await db_session.flush()
    db_session.add(
        UserFacilityUnit(user_id=user.id, facility_id=facility.id, unit_id=unit.id)
    )
    await db_session.commit()
    return unit


class TestDefaultUnitOnLogin:
    async def test_single_unit_is_auto_selected(self, client, db_session, make_auth):
        auth = await make_auth(roles=("CLINICIAN",), medical_id="MED-CTX-1")
        unit = await _add_unit(db_session, auth.user, auth.facility, "ICU")

        resp = await client.post(
            f"{API}/login", json={"medical_id": "MED-CTX-1", "password": "S3cret-pass"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        me = await client.get(f"{API}/me", headers={"Authorization": f"Bearer {token}"})
        assert me.json()["active_unit_id"] == str(unit.id)

    async def test_multiple_units_leave_active_unit_unset(self, client, db_session, make_auth):
        auth = await make_auth(roles=("CLINICIAN",), medical_id="MED-CTX-2")
        await _add_unit(db_session, auth.user, auth.facility, "ICU")
        await _add_unit(db_session, auth.user, auth.facility, "HDU")

        resp = await client.post(
            f"{API}/login", json={"medical_id": "MED-CTX-2", "password": "S3cret-pass"}
        )
        token = resp.json()["access_token"]
        me = await client.get(f"{API}/me", headers={"Authorization": f"Bearer {token}"})
        # Ambiguous → the frontend prompts the user to pick, so no unit is preset.
        assert me.json()["active_unit_id"] is None
        assert len(me.json()["unit_ids"]) == 2


class TestSwitchContext:
    async def test_switch_sets_active_unit(self, client, db_session, make_auth):
        auth = await make_auth(roles=("CLINICIAN",), medical_id="MED-CTX-3")
        icu = await _add_unit(db_session, auth.user, auth.facility, "ICU")
        hdu = await _add_unit(db_session, auth.user, auth.facility, "HDU")

        resp = await client.post(
            f"{API}/switch-context",
            headers=auth.headers,
            json={"facility_id": str(auth.facility.id), "unit_id": str(hdu.id)},
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        me = await client.get(f"{API}/me", headers={"Authorization": f"Bearer {token}"})
        assert me.json()["active_unit_id"] == str(hdu.id)
        assert icu.id  # both units belong to the user

    async def test_switch_to_foreign_unit_forbidden(self, client, make_auth):
        auth = await make_auth(roles=("CLINICIAN",), medical_id="MED-CTX-4")
        resp = await client.post(
            f"{API}/switch-context",
            headers=auth.headers,
            json={"facility_id": str(auth.facility.id), "unit_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 403

    async def test_switch_without_unit_resets_to_default(self, client, db_session, make_auth):
        auth = await make_auth(roles=("CLINICIAN",), medical_id="MED-CTX-5")
        icu = await _add_unit(db_session, auth.user, auth.facility, "ICU")

        resp = await client.post(
            f"{API}/switch-context",
            headers=auth.headers,
            json={"facility_id": str(auth.facility.id)},
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        me = await client.get(f"{API}/me", headers={"Authorization": f"Bearer {token}"})
        # Sole unit → unambiguous default is applied even though none was requested.
        assert me.json()["active_unit_id"] == str(icu.id)

    async def test_switch_to_foreign_facility_forbidden(self, client, make_auth):
        auth = await make_auth(roles=("CLINICIAN",), medical_id="MED-CTX-6")
        resp = await client.post(
            f"{API}/switch-context",
            headers=auth.headers,
            json={"facility_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 403
