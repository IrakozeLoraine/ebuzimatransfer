"""Integration tests for the auth flows not covered by the login happy-path:
refresh, switch-facility, change-password, logout and self-service profile edit.
"""
import uuid

import pytest

from app.core.security import create_refresh_token

pytestmark = pytest.mark.asyncio

API = "/api/v1/auth"


class TestRefresh:
    async def test_refresh_returns_new_tokens(self, client, make_auth):
        auth = await make_auth(roles=("CLINICIAN",))
        token = create_refresh_token(str(auth.user.id))
        resp = await client.post(f"{API}/refresh", json={"refresh_token": token})
        assert resp.status_code == 200
        assert resp.json()["access_token"]

    async def test_refresh_rejects_garbage(self, client):
        resp = await client.post(f"{API}/refresh", json={"refresh_token": "not-a-token"})
        assert resp.status_code == 401


class TestSwitchFacility:
    async def test_switch_to_own_facility(self, client, make_auth):
        auth = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(
            f"{API}/switch-facility",
            headers=auth.headers,
            json={"facility_id": str(auth.facility.id)},
        )
        assert resp.status_code == 200
        assert resp.json()["access_token"]

    async def test_switch_to_foreign_facility_forbidden(self, client, make_auth):
        auth = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(
            f"{API}/switch-facility",
            headers=auth.headers,
            json={"facility_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 403


class TestChangePassword:
    async def test_change_with_correct_current_password(self, client, make_auth):
        # user_factory seeds the password "S3cret-pass".
        auth = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(
            f"{API}/change-password",
            headers=auth.headers,
            json={"current_password": "S3cret-pass", "new_password": "Brand-New-1"},
        )
        assert resp.status_code == 200

    async def test_change_with_wrong_current_password(self, client, make_auth):
        auth = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(
            f"{API}/change-password",
            headers=auth.headers,
            json={"current_password": "wrong", "new_password": "Whatever-1"},
        )
        assert resp.status_code == 401


class TestSessionAndProfile:
    async def test_logout(self, client, make_auth):
        auth = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(f"{API}/logout", headers=auth.headers)
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    async def test_update_own_profile(self, client, make_auth):
        auth = await make_auth(roles=("CLINICIAN",))
        resp = await client.put(
            f"{API}/me",
            headers=auth.headers,
            json={"phone": "0788123123", "location": "Kigali"},
        )
        assert resp.status_code == 200
        me = resp.json()
        assert me["phone"] == "0788123123"
        assert me["location"] == "Kigali"

    async def test_me_reflects_active_facility(self, client, make_auth):
        auth = await make_auth(roles=("CLINICIAN",))
        resp = await client.get(f"{API}/me", headers=auth.headers)
        assert resp.status_code == 200
        assert resp.json()["active_facility_id"] == str(auth.facility.id)
