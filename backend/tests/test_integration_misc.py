"""API-level integration tests for the smaller endpoint groups: notifications,
dashboard, reports, audit and the location cascade — plus the NotificationService
and ReportService behind them."""
import uuid

import pytest

from app.models.unit import Unit
from app.models.resource import Resource
from app.models.location import Location
from app.models.audit_log import AuditLog
from app.services.notification_service import NotificationService

pytestmark = pytest.mark.asyncio


class TestNotifications:
    API = "/api/v1/notifications"

    async def test_list_and_unread_count_and_mark_read(self, client, make_auth, db_session):
        user = await make_auth(roles=("CLINICIAN",))
        svc = NotificationService(db_session)
        n1 = await svc.create(user.user.id, "Hi", "there", "NEW_REFERRAL", "referral", uuid.uuid4())
        await svc.create(user.user.id, "Two", "body")
        await db_session.commit()

        listed = await client.get(self.API, headers=user.headers)
        assert listed.status_code == 200
        assert len(listed.json()) == 2

        count = await client.get(f"{self.API}/unread-count", headers=user.headers)
        assert count.json()["count"] == 2

        unread = await client.get(f"{self.API}?unread_only=true", headers=user.headers)
        assert len(unread.json()) == 2

        marked = await client.patch(f"{self.API}/{n1.id}/read", headers=user.headers)
        assert marked.status_code == 200
        assert (await client.get(f"{self.API}/unread-count", headers=user.headers)).json()["count"] == 1

        all_read = await client.patch(f"{self.API}/mark-all-read", headers=user.headers)
        assert all_read.status_code == 200
        assert (await client.get(f"{self.API}/unread-count", headers=user.headers)).json()["count"] == 0

    async def test_notify_role_reaches_users_holding_it(self, client, make_auth, db_session):
        target = await make_auth(roles=("FACILITY_ADMIN",))
        svc = NotificationService(db_session)
        await svc.notify_role("FACILITY_ADMIN", "Broadcast", "for admins")
        await db_session.commit()
        listed = await client.get(self.API, headers=target.headers)
        assert any(n["title"] == "Broadcast" for n in listed.json())

    async def test_requires_auth(self, client):
        assert (await client.get(self.API)).status_code == 401


class TestDashboard:
    API = "/api/v1/dashboard"

    async def test_capacity_activity_and_transit_stats(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        db_session.add(
            Resource(resource_name="Bed", facility_id=admin.facility.id, unit_id=unit.id,
                     quantity=4, occupied=1)
        )
        await db_session.commit()

        cap = await client.get(f"{self.API}/capacity", headers=admin.headers)
        assert cap.status_code == 200
        assert len(cap.json()) >= 1

        act = await client.get(f"{self.API}/activity?limit=10", headers=admin.headers)
        assert act.status_code == 200

        stats = await client.get(f"{self.API}/transit-stats", headers=admin.headers)
        assert stats.status_code == 200
        assert "completed_journeys" in stats.json()

    async def test_facility_scoped_dashboard(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        resp = await client.get(f"{self.API}/capacity", headers=admin.headers)
        assert resp.status_code == 200


class TestReports:
    API = "/api/v1/reports"

    async def test_occupancy_report(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        db_session.add(
            Resource(resource_name="Bed", facility_id=admin.facility.id, unit_id=unit.id,
                     quantity=4, occupied=2)
        )
        await db_session.commit()

        resp = await client.get(f"{self.API}/occupancy", headers=admin.headers)
        assert resp.status_code == 200
        rows = resp.json()
        assert rows and rows[0]["occupancy_rate"] == 50.0

    async def test_export_excel(self, client, make_auth):
        pytest.importorskip("pandas")  # export_excel builds the workbook with pandas
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.get(f"{self.API}/export/excel", headers=admin.headers)
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith(
            "application/vnd.openxmlformats"
        )
        assert resp.content[:2] == b"PK"  # xlsx is a zip

    async def test_requires_super_admin(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        assert (await client.get(f"{self.API}/occupancy", headers=admin.headers)).status_code == 403


class TestAudit:
    API = "/api/v1/audit"

    async def test_super_admin_sees_all_logs(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        db_session.add(
            AuditLog(user_id=admin.user.id, action="CREATE_USER", entity_type="user",
                     entity_id=admin.user.id)
        )
        db_session.add(
            AuditLog(user_id=admin.user.id, action="CREATE_FACILITY", entity_type="facility",
                     entity_id=admin.facility.id)
        )
        await db_session.commit()

        resp = await client.get(self.API, headers=admin.headers)
        assert resp.status_code == 200
        actions = {row["action"] for row in resp.json()}
        assert "CREATE_USER" in actions

    async def test_filter_by_action_and_entity_type(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        db_session.add(
            AuditLog(user_id=admin.user.id, action="LOGIN", entity_type="user", entity_id=admin.user.id)
        )
        await db_session.commit()
        resp = await client.get(f"{self.API}?action=LOGIN&entity_type=user", headers=admin.headers)
        assert resp.status_code == 200
        assert all(r["action"] == "LOGIN" for r in resp.json())

    async def test_facility_admin_scoped_logs(self, client, make_auth, db_session):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        db_session.add(
            AuditLog(user_id=admin.user.id, action="UPDATE_RESOURCE", entity_type="resource")
        )
        await db_session.commit()
        resp = await client.get(self.API, headers=admin.headers)
        assert resp.status_code == 200

    async def test_requires_admin(self, client, make_auth):
        clinician = await make_auth(roles=("CLINICIAN",))
        assert (await client.get(self.API, headers=clinician.headers)).status_code == 403


class TestLocations:
    API = "/api/v1/locations"

    async def _seed_hierarchy(self, db_session):
        province = Location(name="Kigali", level="PROVINCE", parent_id=None)
        db_session.add(province)
        await db_session.flush()
        district = Location(name="Gasabo", level="DISTRICT", parent_id=province.id)
        db_session.add(district)
        await db_session.flush()
        sector = Location(name="Remera", level="SECTOR", parent_id=district.id)
        db_session.add(sector)
        await db_session.flush()
        cell = Location(name="Rukiri", level="CELL", parent_id=sector.id)
        db_session.add(cell)
        await db_session.flush()
        db_session.add(Location(name="Amahoro", level="VILLAGE", parent_id=cell.id))
        await db_session.commit()

    async def test_cascade_from_province_to_village(self, client, db_session):
        await self._seed_hierarchy(db_session)

        provinces = await client.get(f"{self.API}/provinces")
        assert provinces.status_code == 200
        assert "Kigali" in provinces.json()

        districts = await client.get(f"{self.API}/districts?province=Kigali")
        assert "Gasabo" in districts.json()

        sectors = await client.get(f"{self.API}/sectors?province=Kigali&district=Gasabo")
        assert "Remera" in sectors.json()

        cells = await client.get(f"{self.API}/cells?province=Kigali&district=Gasabo&sector=Remera")
        assert "Rukiri" in cells.json()

        villages = await client.get(
            f"{self.API}/villages?province=Kigali&district=Gasabo&sector=Remera&cell=Rukiri"
        )
        assert "Amahoro" in villages.json()

    async def test_unknown_branch_returns_empty(self, client, db_session):
        await self._seed_hierarchy(db_session)
        resp = await client.get(f"{self.API}/districts?province=Nowhere")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_legacy_districts_path(self, client, db_session):
        await self._seed_hierarchy(db_session)
        resp = await client.get(f"{self.API}/provinces/Kigali/districts")
        assert resp.status_code == 200
        assert "Gasabo" in resp.json()
