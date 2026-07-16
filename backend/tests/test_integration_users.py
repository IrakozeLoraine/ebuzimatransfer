"""API-level integration tests for the user-management endpoints.

These drive the real FastAPI app over ASGI (see the ``client`` / ``make_auth``
fixtures in conftest), so the ``/users`` routes, ``UserService`` and the
``UserRepository`` are exercised together. Skipped automatically when no test
database is reachable.
"""
import io
import csv

import pytest

pytestmark = pytest.mark.asyncio

API = "/api/v1/users"


def _csv_bytes(rows: list[list[str]]) -> bytes:
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    return buf.getvalue().encode("utf-8")


class TestListUsers:
    async def test_super_admin_lists_all_users(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        await make_auth(roles=("CLINICIAN",))

        resp = await client.get(API, headers=admin.headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 2

    async def test_facility_admin_lists_only_their_facility(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))

        resp = await client.get(API, headers=admin.headers)
        assert resp.status_code == 200
        # The admin themselves belongs to their facility.
        assert any(u["medical_id"] == admin.user.medical_id for u in resp.json())

    async def test_requires_admin_role(self, client, make_auth):
        clinician = await make_auth(roles=("CLINICIAN",))
        resp = await client.get(API, headers=clinician.headers)
        assert resp.status_code == 403

    async def test_requires_authentication(self, client):
        resp = await client.get(API)
        assert resp.status_code == 401


class TestCreateUser:
    async def test_super_admin_creates_an_identity(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(
            API,
            headers=admin.headers,
            json={
                "medical_id": "NEW-100",
                "first_name": "Grace",
                "last_name": "Ineza",
                "email": "grace@chuk.rw",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["medical_id"] == "NEW-100"
        assert body["account_status"] == "PASSWORD_RESET_ENABLED"

    async def test_duplicate_medical_id_conflicts(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        payload = {"medical_id": "DUP-1", "first_name": "A", "last_name": "B"}
        assert (await client.post(API, headers=admin.headers, json=payload)).status_code == 201
        resp = await client.post(API, headers=admin.headers, json=payload)
        assert resp.status_code == 409

    async def test_duplicate_email_conflicts(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        await client.post(
            API, headers=admin.headers,
            json={"medical_id": "EM-1", "first_name": "A", "last_name": "B", "email": "clash@x.rw"},
        )
        resp = await client.post(
            API, headers=admin.headers,
            json={"medical_id": "EM-2", "first_name": "C", "last_name": "D", "email": "clash@x.rw"},
        )
        assert resp.status_code == 409

    async def test_facility_admin_cannot_create_bare_identity(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        resp = await client.post(
            API, headers=admin.headers,
            json={"medical_id": "X-1", "first_name": "A", "last_name": "B"},
        )
        assert resp.status_code == 403


class TestCreateAndAssign:
    async def test_super_admin_creates_and_assigns_with_facility_id(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(
            f"{API}/create-and-assign",
            headers=admin.headers,
            json={
                "medical_id": "CA-1",
                "first_name": "Jean",
                "last_name": "Bosco",
                "roles": ["CLINICIAN"],
                "facility_id": str(admin.facility.id),
            },
        )
        assert resp.status_code == 201
        assert resp.json()["facility_roles"][0]["roles"] == ["CLINICIAN"]

    async def test_super_admin_without_facility_id_is_rejected(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(
            f"{API}/create-and-assign",
            headers=admin.headers,
            json={"medical_id": "CA-2", "first_name": "J", "last_name": "B", "roles": ["CLINICIAN"]},
        )
        assert resp.status_code == 422

    async def test_facility_admin_creates_and_assigns_into_own_facility(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        resp = await client.post(
            f"{API}/create-and-assign",
            headers=admin.headers,
            json={"medical_id": "CA-3", "first_name": "K", "last_name": "L", "roles": ["CLINICIAN"]},
        )
        assert resp.status_code == 201

    async def test_invalid_role_is_rejected(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(
            f"{API}/create-and-assign",
            headers=admin.headers,
            json={
                "medical_id": "CA-4", "first_name": "K", "last_name": "L",
                "roles": ["WIZARD"], "facility_id": str(admin.facility.id),
            },
        )
        assert resp.status_code == 422


class TestAssignRoles:
    async def test_facility_admin_assigns_existing_user(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        target = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(
            f"{API}/assign",
            headers=admin.headers,
            json={"medical_id": target.user.medical_id, "roles": ["CLINICIAN", "FACILITY_ADMIN"]},
        )
        assert resp.status_code == 200

    async def test_facility_admin_cannot_assign_self(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        resp = await client.post(
            f"{API}/assign",
            headers=admin.headers,
            json={"medical_id": admin.user.medical_id, "roles": ["CLINICIAN"]},
        )
        assert resp.status_code == 403

    async def test_super_admin_must_use_scoped_assign(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        target = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(
            f"{API}/assign",
            headers=admin.headers,
            json={"medical_id": target.user.medical_id, "roles": ["CLINICIAN"]},
        )
        assert resp.status_code == 422

    async def test_super_admin_assigns_at_specific_facility(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        target = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(
            f"{API}/assign/{admin.facility.id}",
            headers=admin.headers,
            json={"medical_id": target.user.medical_id, "roles": ["FACILITY_ADMIN"]},
        )
        assert resp.status_code == 200

    async def test_assign_unknown_user_is_not_found(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(
            f"{API}/assign/{admin.facility.id}",
            headers=admin.headers,
            json={"medical_id": "GHOST", "roles": ["CLINICIAN"]},
        )
        assert resp.status_code == 404


class TestStatusAndUpdate:
    async def test_set_status_deactivates(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        target = await make_auth(roles=("CLINICIAN",))
        resp = await client.patch(
            f"{API}/{target.user.id}/status",
            headers=admin.headers,
            json={"account_status": "INACTIVE"},
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    async def test_update_user_fields(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        target = await make_auth(roles=("CLINICIAN",))
        resp = await client.put(
            f"{API}/{target.user.id}",
            headers=admin.headers,
            json={"first_name": "Renamed", "phone": "0788000000"},
        )
        assert resp.status_code == 200
        assert resp.json()["first_name"] == "Renamed"

    async def test_get_user(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        target = await make_auth(roles=("CLINICIAN",))
        resp = await client.get(f"{API}/{target.user.id}", headers=admin.headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == str(target.user.id)

    async def test_get_unknown_user_is_not_found(self, client, make_auth):
        import uuid
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.get(f"{API}/{uuid.uuid4()}", headers=admin.headers)
        assert resp.status_code == 404

    async def test_deactivate_user(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        target = await make_auth(roles=("CLINICIAN",))
        resp = await client.delete(f"{API}/{target.user.id}", headers=admin.headers)
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    async def test_remove_user_from_facility(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        target = await make_auth(roles=("CLINICIAN",))
        resp = await client.delete(
            f"{API}/{target.user.id}/facilities/{target.facility.id}",
            headers=admin.headers,
        )
        assert resp.status_code == 200


class TestImport:
    async def test_super_admin_imports_users_from_csv(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = _csv_bytes(
            [
                ["medical_id", "first_name", "last_name", "roles"],
                ["IMP-1", "Ann", "Nk", "CLINICIAN"],
                ["IMP-2", "Ben", "Mu", "FACILITY_ADMIN"],
            ]
        )
        resp = await client.post(
            f"{API}/import?facility_id={admin.facility.id}",
            headers=admin.headers,
            files={"file": ("users.csv", data, "text/csv")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["created"] == 2
        assert body["assigned"] == 2

    async def test_super_admin_import_requires_facility_id(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = _csv_bytes([["medical_id"], ["IMP-9"]])
        resp = await client.post(
            f"{API}/import",
            headers=admin.headers,
            files={"file": ("users.csv", data, "text/csv")},
        )
        assert resp.status_code == 422

    async def test_import_reports_row_errors(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = _csv_bytes(
            [
                ["medical_id", "first_name", "last_name", "roles"],
                ["IMP-3", "", "", "CLINICIAN"],         # missing names for a new user
                ["IMP-4", "Cy", "Ka", "WIZARD"],        # invalid role
            ]
        )
        resp = await client.post(
            f"{API}/import?facility_id={admin.facility.id}",
            headers=admin.headers,
            files={"file": ("users.csv", data, "text/csv")},
        )
        assert resp.status_code == 200
        assert len(resp.json()["errors"]) == 2
