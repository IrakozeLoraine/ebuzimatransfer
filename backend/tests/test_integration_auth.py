"""End-to-end integration tests for the authentication flow.

These drive the real FastAPI app over ASGI against a live PostgreSQL database
(see the ``client`` / ``db_session`` / ``user_factory`` fixtures in conftest).
They cover the two-step login, credential rejection, the token-authenticated
``/me`` endpoint, and the first-login password-reset path.
"""
import pytest

pytestmark = pytest.mark.asyncio

API = "/api/v1/auth"


async def test_health_endpoint(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "service": "eBuzimaTransfer"}


async def test_login_id_step_signals_password_prompt(client, user_factory):
    await user_factory(medical_id="MED-1", password="Correct-horse")

    # First step: medical id only. No tokens yet — the UI should reveal the
    # password field.
    resp = await client.post(f"{API}/login", json={"medical_id": "MED-1"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["requires_password_reset"] is False
    assert body["access_token"] is None


async def test_login_with_correct_password_returns_tokens(client, user_factory):
    await user_factory(medical_id="MED-2", password="Correct-horse")

    resp = await client.post(
        f"{API}/login",
        json={"medical_id": "MED-2", "password": "Correct-horse"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["token_type"] == "bearer"


async def test_login_with_wrong_password_is_unauthorized(client, user_factory):
    await user_factory(medical_id="MED-3", password="Correct-horse")

    resp = await client.post(
        f"{API}/login",
        json={"medical_id": "MED-3", "password": "wrong-password"},
    )
    assert resp.status_code == 401


async def test_login_unknown_user_is_unauthorized(client):
    resp = await client.post(
        f"{API}/login",
        json={"medical_id": "NOBODY", "password": "whatever"},
    )
    assert resp.status_code == 401


async def test_me_requires_authentication(client):
    resp = await client.get(f"{API}/me")
    assert resp.status_code == 401


async def test_me_returns_profile_for_valid_token(client, user_factory):
    await user_factory(
        medical_id="MED-4", password="Correct-horse", roles=("CLINICIAN",)
    )

    login = await client.post(
        f"{API}/login",
        json={"medical_id": "MED-4", "password": "Correct-horse"},
    )
    token = login.json()["access_token"]

    resp = await client.get(
        f"{API}/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    me = resp.json()
    assert me["medical_id"] == "MED-4"
    assert "CLINICIAN" in me["roles"]
    assert len(me["facilities"]) == 1


async def test_me_rejects_a_garbage_token(client):
    resp = await client.get(
        f"{API}/me", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert resp.status_code == 401


async def test_first_login_requires_password_reset(client, user_factory):
    from app.models.user import AccountStatus

    await user_factory(
        medical_id="MED-5",
        password="anything",
        account_status=AccountStatus.PASSWORD_RESET_ENABLED.value,
    )

    resp = await client.post(f"{API}/login", json={"medical_id": "MED-5"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["requires_password_reset"] is True
    assert body["reset_token"]


async def test_set_password_completes_first_login(client, user_factory):
    from app.models.user import AccountStatus

    await user_factory(
        medical_id="MED-6",
        password="anything",
        account_status=AccountStatus.PASSWORD_RESET_ENABLED.value,
    )

    reset_token = (
        await client.post(f"{API}/login", json={"medical_id": "MED-6"})
    ).json()["reset_token"]

    # Set a new password using the reset token; we get real tokens back.
    resp = await client.post(
        f"{API}/set-password",
        json={"reset_token": reset_token, "new_password": "Brand-new-pass"},
    )
    assert resp.status_code == 200
    assert resp.json()["access_token"]

    # The new password now authenticates on the normal login path.
    relogin = await client.post(
        f"{API}/login",
        json={"medical_id": "MED-6", "password": "Brand-new-pass"},
    )
    assert relogin.status_code == 200
    assert relogin.json()["access_token"]
