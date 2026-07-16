"""API-level integration tests for the resources endpoints and ResourceService —
create/list/assign/add/remove/reserve/counts plus the spreadsheet import."""
import io
import csv
import uuid

import pytest
import pytest_asyncio

from app.models.unit import Unit
from app.models.resource import Resource

pytestmark = pytest.mark.asyncio

API = "/api/v1/resources"


def _csv_bytes(rows: list[list[str]]) -> bytes:
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    return buf.getvalue().encode("utf-8")


@pytest_asyncio.fixture
async def unit(db_session):
    u = Unit(name="ICU", tier="DISTRICT")
    db_session.add(u)
    await db_session.commit()
    return u


async def _make_resource(db_session, facility_id, unit_id, *, quantity=3, name="ICU Bed", **counts):
    r = Resource(resource_name=name, facility_id=facility_id, unit_id=unit_id, quantity=quantity, **counts)
    db_session.add(r)
    await db_session.commit()
    return r


class TestCreate:
    async def test_super_admin_creates_resource(self, client, make_auth, unit):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(
            API,
            headers=admin.headers,
            json={
                "resource_name": "Ventilator",
                "quantity": 4,
                "unit_id": str(unit.id),
                "facility_id": str(admin.facility.id),
            },
        )
        assert resp.status_code == 201
        assert resp.json()["available"] == 4

    async def test_super_admin_creates_central_stock(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(
            API, headers=admin.headers, json={"resource_name": "Spare Bed", "quantity": 5}
        )
        assert resp.status_code == 201
        # Central stock is held out of service until assigned.
        assert resp.json()["out_of_service"] == 5

    async def test_facility_admin_creates_in_own_facility(self, client, make_auth, unit):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        resp = await client.post(
            API,
            headers=admin.headers,
            json={"resource_name": "Monitor", "quantity": 2, "unit_id": str(unit.id)},
        )
        assert resp.status_code == 201
        assert resp.json()["facility_id"] == str(admin.facility.id)

    async def test_facility_admin_must_pick_a_unit(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        resp = await client.post(API, headers=admin.headers, json={"resource_name": "X", "quantity": 1})
        assert resp.status_code == 422

    async def test_unit_above_facility_tier_is_rejected(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",), facility_type="DISTRICT")
        high_unit = Unit(name="Advanced", tier="NRH_UTH")
        db_session.add(high_unit)
        await db_session.commit()
        resp = await client.post(
            API,
            headers=admin.headers,
            json={
                "resource_name": "X", "quantity": 1,
                "unit_id": str(high_unit.id), "facility_id": str(admin.facility.id),
            },
        )
        assert resp.status_code == 422


class TestListGet:
    async def test_super_admin_lists_scoped(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        await _make_resource(db_session, admin.facility.id, unit.id)
        resp = await client.get(API, headers=admin.headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_facility_admin_lists_own_only(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        await _make_resource(db_session, admin.facility.id, unit.id)
        resp = await client.get(API, headers=admin.headers)
        assert resp.status_code == 200

    async def test_facility_admin_forbidden_other_facility_filter(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        other = await make_auth(roles=("CLINICIAN",))
        resp = await client.get(f"{API}?facility_id={other.facility.id}", headers=admin.headers)
        assert resp.status_code == 403

    async def test_available_resources(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("CLINICIAN",))
        await _make_resource(db_session, admin.facility.id, unit.id)
        resp = await client.get(f"{API}/available?unit_id={unit.id}", headers=admin.headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_get_resource(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("CLINICIAN",))
        r = await _make_resource(db_session, admin.facility.id, unit.id)
        resp = await client.get(f"{API}/{r.id}", headers=admin.headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == str(r.id)

    async def test_get_unknown_resource_is_not_found(self, client, make_auth):
        admin = await make_auth(roles=("CLINICIAN",))
        resp = await client.get(f"{API}/{uuid.uuid4()}", headers=admin.headers)
        assert resp.status_code == 404

    async def test_usage_lists_reservations(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("CLINICIAN",))
        r = await _make_resource(db_session, admin.facility.id, unit.id)
        await client.post(f"{API}/{r.id}/reserve", headers=admin.headers, json={})
        resp = await client.get(f"{API}/{r.id}/usage", headers=admin.headers)
        assert resp.status_code == 200
        assert len(resp.json()["reservations"]) == 1


class TestUnitsCounts:
    async def test_add_units(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        r = await _make_resource(db_session, admin.facility.id, unit.id, quantity=2)
        resp = await client.post(f"{API}/{r.id}/add-units", headers=admin.headers, json={"count": 3})
        assert resp.status_code == 200
        assert resp.json()["quantity"] == 5

    async def test_remove_units_only_out_of_service(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        r = await _make_resource(db_session, admin.facility.id, unit.id, quantity=4, out_of_service=2)
        resp = await client.post(f"{API}/{r.id}/remove-units", headers=admin.headers, json={"count": 2})
        assert resp.status_code == 200
        assert resp.json()["quantity"] == 2

    async def test_remove_more_than_out_of_service_rejected(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        r = await _make_resource(db_session, admin.facility.id, unit.id, quantity=4, out_of_service=1)
        resp = await client.post(f"{API}/{r.id}/remove-units", headers=admin.headers, json={"count": 2})
        assert resp.status_code == 422

    async def test_facility_admin_cannot_add_units_elsewhere(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        other = await make_auth(roles=("CLINICIAN",))
        r = await _make_resource(db_session, other.facility.id, unit.id)
        resp = await client.post(f"{API}/{r.id}/add-units", headers=admin.headers, json={"count": 1})
        assert resp.status_code == 403

    async def test_update_counts(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        r = await _make_resource(db_session, admin.facility.id, unit.id, quantity=5)
        resp = await client.patch(
            f"{API}/{r.id}/counts",
            headers=admin.headers,
            json={"occupied": 2, "reserved": 1, "out_of_service": 0},
        )
        assert resp.status_code == 200
        assert resp.json()["available"] == 2

    async def test_update_counts_exceeding_quantity_rejected(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        r = await _make_resource(db_session, admin.facility.id, unit.id, quantity=2)
        resp = await client.patch(
            f"{API}/{r.id}/counts",
            headers=admin.headers,
            json={"occupied": 2, "reserved": 2, "out_of_service": 0},
        )
        assert resp.status_code == 422


class TestReserve:
    async def test_reserve_available_resource(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("CLINICIAN",))
        r = await _make_resource(db_session, admin.facility.id, unit.id, quantity=1)
        resp = await client.post(f"{API}/{r.id}/reserve", headers=admin.headers, json={})
        assert resp.status_code == 200
        assert resp.json()["reserved"] == 1

    async def test_reserve_unavailable_resource_conflicts(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("CLINICIAN",))
        r = await _make_resource(db_session, admin.facility.id, unit.id, quantity=1, occupied=1)
        resp = await client.post(f"{API}/{r.id}/reserve", headers=admin.headers, json={})
        assert resp.status_code == 409


class TestAssign:
    async def test_super_admin_assigns_to_facility_unit(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        # Central stock resource to assign out.
        r = Resource(resource_name="Pool Bed", quantity=3, out_of_service=3)
        db_session.add(r)
        await db_session.commit()
        resp = await client.post(
            f"{API}/assign",
            headers=admin.headers,
            json={
                "resource_ids": [str(r.id)],
                "facility_id": str(admin.facility.id),
                "unit_id": str(unit.id),
                "quantity": 2,
            },
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_assign_requires_unit_when_targeting_facility(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        r = Resource(resource_name="Pool Bed", quantity=2, out_of_service=2)
        db_session.add(r)
        await db_session.commit()
        resp = await client.post(
            f"{API}/assign",
            headers=admin.headers,
            json={"resource_ids": [str(r.id)], "facility_id": str(admin.facility.id)},
        )
        assert resp.status_code == 422

    async def test_assign_empty_selection_rejected(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(f"{API}/assign", headers=admin.headers, json={"resource_ids": []})
        assert resp.status_code == 422

    async def test_facility_admin_reassigns_unit_within_facility(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        other_unit = Unit(name="HDU", tier="DISTRICT")
        db_session.add(other_unit)
        r = await _make_resource(db_session, admin.facility.id, unit.id, quantity=2)
        resp = await client.post(
            f"{API}/assign",
            headers=admin.headers,
            json={"resource_ids": [str(r.id)], "unit_id": str(other_unit.id)},
        )
        assert resp.status_code == 200

    async def test_facility_admin_cannot_assign_foreign_resource(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        other = await make_auth(roles=("CLINICIAN",))
        r = await _make_resource(db_session, other.facility.id, unit.id)
        resp = await client.post(
            f"{API}/assign",
            headers=admin.headers,
            json={"resource_ids": [str(r.id)], "unit_id": str(unit.id)},
        )
        assert resp.status_code == 403


class TestImport:
    async def test_import_resources_with_errors(self, client, make_auth, unit, db_session):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        data = _csv_bytes(
            [
                ["resource_name", "quantity", "unit", "resource_type"],
                ["Bed A", "3", "ICU", ""],                 # ok
                ["Bad Type", "1", "ICU", "Teleporter"],    # unknown type -> error
                ["Bad Qty", "zero", "ICU", ""],            # invalid quantity -> error
                ["Bad Unit", "1", "Nonexistent", ""],      # unknown unit -> error
                ["", "1", "ICU", ""],                      # blank name -> skipped
            ]
        )
        resp = await client.post(
            f"{API}/import",
            headers=admin.headers,
            files={"file": ("resources.csv", data, "text/csv")},
        )
        assert resp.status_code == 200
        assert resp.json()["created"] == 1
        assert len(resp.json()["errors"]) == 3

    async def test_import_missing_name_column_rejected(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = _csv_bytes([["quantity"], ["1"]])
        resp = await client.post(
            f"{API}/import",
            headers=admin.headers,
            files={"file": ("resources.csv", data, "text/csv")},
        )
        assert resp.status_code == 422
