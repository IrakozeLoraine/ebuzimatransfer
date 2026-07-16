"""API-level integration tests for the units endpoints and UnitService."""
import io
import csv
import uuid

import pytest

from app.models.unit import Unit
from app.models.resource import Resource

pytestmark = pytest.mark.asyncio

API = "/api/v1/units"


def _csv_bytes(rows: list[list[str]]) -> bytes:
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    return buf.getvalue().encode("utf-8")


class TestListCreate:
    async def test_list_units(self, client, make_auth, db_session):
        admin = await make_auth(roles=("CLINICIAN",))
        db_session.add(Unit(name="ICU", tier="DISTRICT"))
        await db_session.commit()
        resp = await client.get(API, headers=admin.headers)
        assert resp.status_code == 200
        assert any(u["name"] == "ICU" for u in resp.json())

    async def test_list_units_scoped_to_facility_tier(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",), facility_type="DISTRICT")
        db_session.add(Unit(name="Basic Ward", tier="DISTRICT"))
        db_session.add(Unit(name="Advanced ICU", tier="NRH_UTH"))
        await db_session.commit()
        resp = await client.get(f"{API}?facility_id={admin.facility.id}", headers=admin.headers)
        assert resp.status_code == 200
        names = {u["name"] for u in resp.json()}
        assert "Basic Ward" in names
        assert "Advanced ICU" not in names  # above the district tier

    async def test_list_units_unknown_facility_is_not_found(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.get(f"{API}?facility_id={uuid.uuid4()}", headers=admin.headers)
        assert resp.status_code == 404

    async def test_super_admin_creates_a_unit(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(
            API, headers=admin.headers, json={"name": "Neonatal ICU", "tier": "NRH_UTH"}
        )
        assert resp.status_code == 201
        assert resp.json()["name"] == "Neonatal ICU"

    async def test_create_rejects_unknown_tier(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(API, headers=admin.headers, json={"name": "X", "tier": "MOON_BASE"})
        assert resp.status_code == 422

    async def test_non_admin_cannot_create(self, client, make_auth):
        clinician = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(API, headers=clinician.headers, json={"name": "X", "tier": "DISTRICT"})
        assert resp.status_code == 403


class TestUpdateDelete:
    async def test_update_unit(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="Old", tier="DISTRICT")
        db_session.add(unit)
        await db_session.commit()
        resp = await client.put(
            f"{API}/{unit.id}", headers=admin.headers, json={"name": "New", "is_active": False}
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New"
        assert resp.json()["is_active"] is False

    async def test_update_unknown_unit_is_not_found(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.put(f"{API}/{uuid.uuid4()}", headers=admin.headers, json={"name": "N"})
        assert resp.status_code == 404

    async def test_delete_empty_unit(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="Disposable", tier="DISTRICT")
        db_session.add(unit)
        await db_session.commit()
        resp = await client.delete(f"{API}/{unit.id}", headers=admin.headers)
        assert resp.status_code == 200

    async def test_delete_unit_with_resources_is_rejected(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="Occupied", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        db_session.add(
            Resource(resource_name="Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=1)
        )
        await db_session.commit()
        resp = await client.delete(f"{API}/{unit.id}", headers=admin.headers)
        assert resp.status_code == 422


class TestImport:
    async def test_import_units_with_errors(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        db_session.add(Unit(name="Existing Unit", tier="DISTRICT"))
        await db_session.commit()
        data = _csv_bytes(
            [
                ["name", "tier", "code"],
                ["Fresh Unit", "District Hospital", "FU"],  # alias resolves -> created
                ["Existing Unit", "DISTRICT", "EU"],        # duplicate -> error
                ["Bad Tier Unit", "wormhole", "BT"],        # unknown tier -> error
                ["", "DISTRICT", ""],                       # blank -> skipped
            ]
        )
        resp = await client.post(
            f"{API}/import",
            headers=admin.headers,
            files={"file": ("units.csv", data, "text/csv")},
        )
        assert resp.status_code == 200
        assert resp.json()["created"] == 1
        assert len(resp.json()["errors"]) == 2

    async def test_import_missing_tier_column_rejected(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = _csv_bytes([["name"], ["Solo"]])
        resp = await client.post(
            f"{API}/import",
            headers=admin.headers,
            files={"file": ("units.csv", data, "text/csv")},
        )
        assert resp.status_code == 422
