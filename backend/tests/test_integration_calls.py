"""API-level integration tests for the phone-line directory, coordination call
logs and the in-app (WebRTC) calling endpoints."""
import io
import csv
import uuid

import pytest

from app.models.unit import Unit
from app.models.user import UserFacilityUnit
from app.models.call import FacilityPhoneLine, PhoneLineType

pytestmark = pytest.mark.asyncio

CALLS = "/api/v1/calls"


def _csv_bytes(rows: list[list[str]]) -> bytes:
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    return buf.getvalue().encode("utf-8")


class TestPhoneLines:
    async def test_super_admin_creates_line_with_facility_id(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(
            f"{CALLS}/phone-lines?facility_id={admin.facility.id}",
            headers=admin.headers,
            json={"label": "ICU Desk", "phone_number": "0788111222"},
        )
        assert resp.status_code == 201
        assert resp.json()["label"] == "ICU Desk"

    async def test_super_admin_requires_facility_id(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        # No facility_id query param at all -> 422 from FastAPI's required Query.
        resp = await client.post(
            f"{CALLS}/phone-lines",
            headers=admin.headers,
            json={"label": "X", "phone_number": "1"},
        )
        assert resp.status_code == 422

    async def test_facility_admin_creates_in_own_facility(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        resp = await client.post(
            f"{CALLS}/phone-lines?facility_id={admin.facility.id}",
            headers=admin.headers,
            json={"label": "Reception", "phone_number": "0700000000", "line_type": "EMERGENCY"},
        )
        assert resp.status_code == 201

    async def test_facility_admin_cannot_target_other_facility(self, client, make_auth):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        other = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(
            f"{CALLS}/phone-lines?facility_id={other.facility.id}",
            headers=admin.headers,
            json={"label": "X", "phone_number": "1"},
        )
        assert resp.status_code == 403

    async def test_list_update_delete_line(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        line = FacilityPhoneLine(
            facility_id=admin.facility.id, label="Old", phone_number="1", line_type=PhoneLineType.COORDINATION
        )
        db_session.add(line)
        await db_session.commit()

        listed = await client.get(
            f"{CALLS}/phone-lines?facility_id={admin.facility.id}", headers=admin.headers
        )
        assert listed.status_code == 200 and len(listed.json()) == 1

        updated = await client.put(
            f"{CALLS}/phone-lines/{line.id}", headers=admin.headers, json={"label": "New"}
        )
        assert updated.status_code == 200 and updated.json()["label"] == "New"

        deleted = await client.delete(f"{CALLS}/phone-lines/{line.id}", headers=admin.headers)
        assert deleted.status_code == 200

    async def test_update_unknown_line_is_not_found(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.put(
            f"{CALLS}/phone-lines/{uuid.uuid4()}", headers=admin.headers, json={"label": "x"}
        )
        assert resp.status_code == 404

    async def test_import_phone_lines_with_errors(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = _csv_bytes(
            [
                ["label", "phone_number", "line_type"],
                ["Desk A", "0788000001", "EMERGENCY"],   # ok
                ["Desk B", "0788000002", "WARPGATE"],     # unknown type -> error
                ["", "0788000003", ""],                   # missing label -> error
                ["", "", ""],                             # blank -> skipped
            ]
        )
        resp = await client.post(
            f"{CALLS}/phone-lines/import?facility_id={admin.facility.id}",
            headers=admin.headers,
            files={"file": ("lines.csv", data, "text/csv")},
        )
        assert resp.status_code == 200
        assert resp.json()["created"] == 1
        assert len(resp.json()["errors"]) == 2

    async def test_import_missing_columns_rejected(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = _csv_bytes([["label"], ["only-label"]])
        resp = await client.post(
            f"{CALLS}/phone-lines/import?facility_id={admin.facility.id}",
            headers=admin.headers,
            files={"file": ("lines.csv", data, "text/csv")},
        )
        assert resp.status_code == 422


class TestCallLog:
    async def test_log_and_list_calls(self, client, make_auth):
        user = await make_auth(roles=("CLINICIAN",))
        logged = await client.post(
            f"{CALLS}/log",
            headers=user.headers,
            json={"to_number": "0788999888", "purpose": "Confirm ICU bed"},
        )
        assert logged.status_code == 201
        assert logged.json()["to_number"] == "0788999888"

        listed = await client.get(f"{CALLS}/log", headers=user.headers)
        assert listed.status_code == 200
        assert len(listed.json()) == 1


class TestInAppCalls:
    async def _recipient_in_unit(self, make_auth, db_session):
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        recipient = await make_auth(roles=("CLINICIAN",))
        db_session.add(
            UserFacilityUnit(user_id=recipient.user.id, facility_id=recipient.facility.id, unit_id=unit.id)
        )
        await db_session.commit()
        return unit, recipient

    async def test_full_call_lifecycle(self, client, make_auth, db_session):
        unit, recipient = await self._recipient_in_unit(make_auth, db_session)
        caller = await make_auth(roles=("CLINICIAN",))

        initiated = await client.post(
            f"{CALLS}/in-app",
            headers=caller.headers,
            json={"facility_id": str(recipient.facility.id), "unit_id": str(unit.id)},
        )
        assert initiated.status_code == 201
        assert initiated.json()["status"] == "RINGING"
        call_id = initiated.json()["id"]

        answered = await client.post(f"{CALLS}/in-app/{call_id}/answer", headers=recipient.headers)
        assert answered.status_code == 200
        assert answered.json()["status"] == "ONGOING"

        signalled = await client.post(
            f"{CALLS}/in-app/{call_id}/signal",
            headers=caller.headers,
            json={"kind": "offer", "data": {"sdp": "x"}},
        )
        assert signalled.status_code == 204

        ended = await client.post(f"{CALLS}/in-app/{call_id}/end", headers=caller.headers)
        assert ended.status_code == 200
        assert ended.json()["status"] == "ENDED"

    async def test_call_with_no_recipients_is_missed(self, client, make_auth, db_session):
        unit = Unit(name="Empty Unit", tier="DISTRICT")
        db_session.add(unit)
        await db_session.commit()
        caller = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(
            f"{CALLS}/in-app",
            headers=caller.headers,
            json={"facility_id": str(caller.facility.id), "unit_id": str(unit.id)},
        )
        assert resp.status_code == 422

    async def test_cancel_before_answer_is_missed(self, client, make_auth, db_session):
        unit, recipient = await self._recipient_in_unit(make_auth, db_session)
        caller = await make_auth(roles=("CLINICIAN",))
        call_id = (
            await client.post(
                f"{CALLS}/in-app",
                headers=caller.headers,
                json={"facility_id": str(recipient.facility.id), "unit_id": str(unit.id)},
            )
        ).json()["id"]
        ended = await client.post(f"{CALLS}/in-app/{call_id}/end", headers=caller.headers)
        assert ended.json()["status"] == "MISSED"

    async def test_call_to_ambulance(self, client, make_auth, db_session):
        from app.models.ambulance import Ambulance
        from app.core.security import hash_password

        caller = await make_auth(roles=("CLINICIAN",))
        amb = Ambulance(
            facility_id=caller.facility.id, plate_number="RAD-1", login_id="RAD-1",
            password_hash=hash_password("x"),
        )
        db_session.add(amb)
        await db_session.commit()
        resp = await client.post(
            f"{CALLS}/in-app/ambulance",
            headers=caller.headers,
            json={"ambulance_id": str(amb.id)},
        )
        assert resp.status_code == 201
        assert resp.json()["callee_ambulance_id"] == str(amb.id)

    async def test_call_to_unknown_ambulance_is_not_found(self, client, make_auth):
        caller = await make_auth(roles=("CLINICIAN",))
        resp = await client.post(
            f"{CALLS}/in-app/ambulance",
            headers=caller.headers,
            json={"ambulance_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 404

    async def test_relay_signal_forbidden_for_outsider(self, client, make_auth, db_session):
        unit, recipient = await self._recipient_in_unit(make_auth, db_session)
        caller = await make_auth(roles=("CLINICIAN",))
        outsider = await make_auth(roles=("CLINICIAN",))
        call_id = (
            await client.post(
                f"{CALLS}/in-app",
                headers=caller.headers,
                json={"facility_id": str(recipient.facility.id), "unit_id": str(unit.id)},
            )
        ).json()["id"]
        resp = await client.post(
            f"{CALLS}/in-app/{call_id}/signal",
            headers=outsider.headers,
            json={"kind": "ice", "data": None},
        )
        assert resp.status_code == 403

    async def test_call_logs_scoped_by_role(self, client, make_auth, db_session):
        unit, recipient = await self._recipient_in_unit(make_auth, db_session)
        caller = await make_auth(roles=("CLINICIAN",))
        await client.post(
            f"{CALLS}/in-app",
            headers=caller.headers,
            json={"facility_id": str(recipient.facility.id), "unit_id": str(unit.id)},
        )

        # Caller sees their own call in the personal log.
        mine = await client.get(f"{CALLS}/in-app", headers=caller.headers)
        assert mine.status_code == 200 and len(mine.json()) == 1

        # Super admin sees every call in the audit log.
        admin = await make_auth(roles=("SUPER_ADMIN",))
        all_log = await client.get(f"{CALLS}/in-app/log", headers=admin.headers)
        assert all_log.status_code == 200 and len(all_log.json()) >= 1

        # The rung clinician sees it in their scoped log (rung to a unit they work in).
        recip_log = await client.get(f"{CALLS}/in-app/log", headers=recipient.headers)
        assert recip_log.status_code == 200 and len(recip_log.json()) >= 1
