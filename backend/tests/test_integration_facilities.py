"""API-level integration tests for the facilities endpoints and FacilityService,
including the spreadsheet bulk-import paths."""
import io
import csv
import uuid

import pytest

pytestmark = pytest.mark.asyncio

API = "/api/v1/facilities"


def _csv_bytes(rows: list[list[str]]) -> bytes:
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    return buf.getvalue().encode("utf-8")


class TestCrud:
    async def test_list_is_open_to_any_authenticated_user(self, client, make_auth):
        clinician = await make_auth(roles=("CLINICIAN",))
        resp = await client.get(API, headers=clinician.headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_requires_auth(self, client):
        assert (await client.get(API)).status_code == 401

    async def test_super_admin_creates_a_facility(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(
            API,
            headers=admin.headers,
            json={"name": "Ruhengeri Referral", "type": "LEVEL_TWO", "province": "North"},
        )
        assert resp.status_code == 201
        assert resp.json()["name"] == "Ruhengeri Referral"

    async def test_non_admin_cannot_create(self, client, make_auth):
        clinician = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(API, headers=clinician.headers, json={"name": "X", "type": "DISTRICT"})
        assert resp.status_code == 403

    async def test_get_facility(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.get(f"{API}/{admin.facility.id}", headers=admin.headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == str(admin.facility.id)

    async def test_get_unknown_facility_is_not_found(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.get(f"{API}/{uuid.uuid4()}", headers=admin.headers)
        assert resp.status_code == 404

    async def test_update_facility(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.put(
            f"{API}/{admin.facility.id}",
            headers=admin.headers,
            json={"district": "Gasabo"},
        )
        assert resp.status_code == 200
        assert resp.json()["district"] == "Gasabo"

    async def test_delete_facility_soft_deactivates(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.delete(f"{API}/{admin.facility.id}", headers=admin.headers)
        assert resp.status_code == 200
        got = await client.get(f"{API}/{admin.facility.id}", headers=admin.headers)
        assert got.json()["is_active"] is False

    async def test_list_facility_users(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.get(f"{API}/{admin.facility.id}/users", headers=admin.headers)
        assert resp.status_code == 200

    async def test_facility_admin_cannot_view_other_facility_users(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        other = await make_auth(roles=("CLINICIAN",))
        resp = await client.get(f"{API}/{other.facility.id}/users", headers=admin.headers)
        assert resp.status_code == 403


class TestLocation:
    async def test_facility_admin_pins_own_location(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        resp = await client.patch(
            f"{API}/{admin.facility.id}/location",
            headers=admin.headers,
            json={"latitude": -1.95, "longitude": 30.06},
        )
        assert resp.status_code == 200
        assert resp.json()["latitude"] == -1.95

    async def test_facility_admin_cannot_pin_other_facility(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        other = await make_auth(roles=("CLINICIAN",))
        resp = await client.patch(
            f"{API}/{other.facility.id}/location",
            headers=admin.headers,
            json={"latitude": 0.0, "longitude": 0.0},
        )
        assert resp.status_code == 403

    async def test_super_admin_pins_any_facility(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        other = await make_auth(roles=("CLINICIAN",))
        resp = await client.patch(
            f"{API}/{other.facility.id}/location",
            headers=admin.headers,
            json={"latitude": 1.0, "longitude": 2.0},
        )
        assert resp.status_code == 200


class TestImport:
    async def test_import_creates_facilities_and_reports_errors(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = _csv_bytes(
            [
                ["name", "type", "province"],
                ["New District Hospital", "District Hospital", "South"],  # alias resolves
                ["Mystery Clinic", "spaceship", "West"],                  # unknown type -> error
                ["", "DISTRICT", "East"],                                 # blank name -> skipped
            ]
        )
        resp = await client.post(
            f"{API}/import",
            headers=admin.headers,
            files={"file": ("facilities.csv", data, "text/csv")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["created"] == 1
        assert len(body["errors"]) == 1

    async def test_import_rejects_duplicate_name(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        # admin.facility already exists in the catalog; re-importing its name errors.
        data = _csv_bytes([["name", "type"], [admin.facility.name, "DISTRICT"]])
        resp = await client.post(
            f"{API}/import",
            headers=admin.headers,
            files={"file": ("facilities.csv", data, "text/csv")},
        )
        assert resp.status_code == 200
        assert resp.json()["created"] == 0
        assert len(resp.json()["errors"]) == 1

    async def test_import_missing_name_column_is_rejected(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = _csv_bytes([["type", "province"], ["DISTRICT", "North"]])
        resp = await client.post(
            f"{API}/import",
            headers=admin.headers,
            files={"file": ("facilities.csv", data, "text/csv")},
        )
        assert resp.status_code == 422
