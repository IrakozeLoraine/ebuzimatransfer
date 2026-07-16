"""Final branch-coverage pass over the calling subsystem (driver <-> clinic call
lifecycle and in-app call scoping), ambulance-management error paths, and the
shared spreadsheet reader."""
import io
import csv
import uuid

import pytest
import pytest_asyncio

from app.core.security import hash_password, create_driver_token
from app.models.unit import Unit
from app.models.user import UserFacilityUnit
from app.models.ambulance import Ambulance
from app.models.transport import TransportEvent

pytestmark = pytest.mark.asyncio

AMB = "/api/v1/ambulances"
CALLS = "/api/v1/calls"
DRIVER = "/api/v1/driver"


async def _ambulance(db_session, facility_id, plate="RAD-X"):
    amb = Ambulance(
        facility_id=facility_id, plate_number=plate, login_id=plate,
        password_hash=hash_password("x"), is_active=True,
    )
    db_session.add(amb)
    await db_session.commit()
    return amb


def _driver_headers(amb):
    return {"Authorization": f"Bearer {create_driver_token(str(amb.id))}"}


@pytest_asyncio.fixture
async def clinic_and_amb(db_session, make_auth):
    """A clinician who can call, plus an ambulance at their facility."""
    clinician = await make_auth(roles=("CLINICIAN",))
    amb = await _ambulance(db_session, clinician.facility.id, plate="RAD-DUO")
    return clinician, amb


class TestDriverCallLifecycle:
    async def test_clinician_calls_ambulance_then_driver_answers_signals_ends(self, client, clinic_and_amb):
        clinician, amb = clinic_and_amb
        driver = _driver_headers(amb)

        # Clinician rings the ambulance.
        call = await client.post(
            f"{CALLS}/in-app/ambulance",
            headers=clinician.headers,
            json={"ambulance_id": str(amb.id)},
        )
        assert call.status_code == 201
        call_id = call.json()["id"]

        answered = await client.post(f"{DRIVER}/calls/{call_id}/answer", headers=driver)
        assert answered.status_code == 200
        assert answered.json()["status"] == "ONGOING"

        signalled = await client.post(
            f"{DRIVER}/calls/{call_id}/signal",
            headers=driver,
            json={"kind": "answer", "data": {"sdp": "y"}},
        )
        assert signalled.status_code == 204

        ended = await client.post(f"{DRIVER}/calls/{call_id}/end", headers=driver)
        assert ended.status_code == 200
        assert ended.json()["status"] == "ENDED"

    async def test_driver_answer_foreign_call_forbidden(self, client, clinic_and_amb, db_session):
        clinician, amb = clinic_and_amb
        other_amb = await _ambulance(db_session, clinician.facility.id, plate="RAD-OTHER")
        call_id = (
            await client.post(
                f"{CALLS}/in-app/ambulance",
                headers=clinician.headers,
                json={"ambulance_id": str(amb.id)},
            )
        ).json()["id"]
        # A different ambulance's driver may not answer this call.
        resp = await client.post(
            f"{DRIVER}/calls/{call_id}/answer", headers=_driver_headers(other_amb)
        )
        assert resp.status_code == 403

    async def test_driver_starts_call_and_ends_it(self, client, db_session, make_auth):
        # Driver calls the receiving unit; a clinician there makes recipients non-empty.
        from types import SimpleNamespace
        from app.services.referral_service import ReferralService
        from app.schemas.referral import ReferralCreate
        from app.models.resource import Resource

        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        res = Resource(resource_name="Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=2)
        db_session.add(res)
        recipient = await make_auth(roles=("CLINICIAN",))
        db_session.add(UserFacilityUnit(user_id=recipient.user.id, facility_id=admin.facility.id, unit_id=unit.id))
        amb = await _ambulance(db_session, admin.facility.id, plate="RAD-STARTER")

        svc = ReferralService(db_session)
        referral = await svc.create(
            ReferralCreate(sex="M", diagnosis="d", reason_for_transfer="r",
                           preferred_facility_id=admin.facility.id, requested_unit_id=unit.id,
                           requested_resource_ids=[res.id]),
            created_by=admin.user.id, referring_facility_id=admin.facility.id,
        )
        await db_session.commit()

        driver = _driver_headers(amb)
        started = await client.post(
            f"{DRIVER}/calls", headers=driver,
            json={"referral_id": str(referral.id), "side": "receiving"},
        )
        assert started.status_code == 201
        call_id = started.json()["id"]
        # The ambulance is the caller — it can end its own call.
        ended = await client.post(f"{DRIVER}/calls/{call_id}/end", headers=driver)
        assert ended.status_code == 200

    async def test_driver_call_referring_side_without_facility_rejected(self, client, db_session, make_auth):
        from app.services.referral_service import ReferralService
        from app.schemas.referral import ReferralCreate
        from app.models.resource import Resource

        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        res = Resource(resource_name="Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=1)
        db_session.add(res)
        amb = await _ambulance(db_session, admin.facility.id, plate="RAD-NOFAC")
        svc = ReferralService(db_session)
        # No referring facility set -> the "referring" side has no facility.
        referral = await svc.create(
            ReferralCreate(sex="M", diagnosis="d", reason_for_transfer="r",
                           preferred_facility_id=admin.facility.id, requested_unit_id=unit.id,
                           requested_resource_ids=[res.id]),
            created_by=admin.user.id, referring_facility_id=None,
        )
        await db_session.commit()
        resp = await client.post(
            f"{DRIVER}/calls", headers=_driver_headers(amb),
            json={"referral_id": str(referral.id), "side": "referring"},
        )
        assert resp.status_code == 422


class TestInAppCallEdges:
    async def _recipient_in_unit(self, make_auth, db_session):
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        recipient = await make_auth(roles=("CLINICIAN",))
        db_session.add(UserFacilityUnit(user_id=recipient.user.id, facility_id=recipient.facility.id, unit_id=unit.id))
        await db_session.commit()
        return unit, recipient

    async def test_answer_already_answered_call_rejected(self, client, make_auth, db_session):
        unit, recipient = await self._recipient_in_unit(make_auth, db_session)
        caller = await make_auth(roles=("CLINICIAN",))
        call_id = (
            await client.post(
                f"{CALLS}/in-app", headers=caller.headers,
                json={"facility_id": str(recipient.facility.id), "unit_id": str(unit.id)},
            )
        ).json()["id"]
        await client.post(f"{CALLS}/in-app/{call_id}/answer", headers=recipient.headers)
        # Second answer attempt is rejected.
        second = await client.post(f"{CALLS}/in-app/{call_id}/answer", headers=recipient.headers)
        assert second.status_code == 422

    async def test_end_call_forbidden_for_outsider(self, client, make_auth, db_session):
        unit, recipient = await self._recipient_in_unit(make_auth, db_session)
        caller = await make_auth(roles=("CLINICIAN",))
        outsider = await make_auth(roles=("CLINICIAN",))
        call_id = (
            await client.post(
                f"{CALLS}/in-app", headers=caller.headers,
                json={"facility_id": str(recipient.facility.id), "unit_id": str(unit.id)},
            )
        ).json()["id"]
        # Once answered, the callee is fixed; a third party can no longer end it.
        await client.post(f"{CALLS}/in-app/{call_id}/answer", headers=recipient.headers)
        resp = await client.post(f"{CALLS}/in-app/{call_id}/end", headers=outsider.headers)
        assert resp.status_code == 403

    async def test_facility_desk_call_without_unit(self, client, make_auth, db_session):
        # A caller at the facility means the facility-wide recipients list is non-empty.
        member = await make_auth(roles=("CLINICIAN",))
        caller = await make_auth(roles=("CLINICIAN",))
        # Put the caller in the same facility as `member` by assigning a role there.
        from app.models.user import UserFacilityRole, Role
        role = Role(name="CLINICIAN-X")
        db_session.add(role)
        await db_session.flush()
        db_session.add(UserFacilityRole(user_id=member.user.id, facility_id=member.facility.id, role_id=role.id))
        await db_session.commit()
        resp = await client.post(
            f"{CALLS}/in-app", headers=caller.headers,
            json={"facility_id": str(member.facility.id)},  # no unit -> facility desk
        )
        # member is at that facility, so the call rings (RINGING) rather than MISSED.
        assert resp.status_code == 201

    async def test_call_to_ambulance_without_facility_rejected(self, client, make_auth, db_session):
        caller = await make_auth(roles=("CLINICIAN",))
        amb = Ambulance(facility_id=None, plate_number="RAD-ORPHAN", login_id="RAD-ORPHAN",
                        password_hash=hash_password("x"))
        db_session.add(amb)
        await db_session.commit()
        resp = await client.post(
            f"{CALLS}/in-app/ambulance", headers=caller.headers, json={"ambulance_id": str(amb.id)}
        )
        assert resp.status_code == 422

    async def test_facility_admin_call_log_scope_and_status_filter(self, client, make_auth, db_session):
        unit, recipient = await self._recipient_in_unit(make_auth, db_session)
        caller = await make_auth(roles=("CLINICIAN",))
        call_id = (
            await client.post(
                f"{CALLS}/in-app", headers=caller.headers,
                json={"facility_id": str(recipient.facility.id), "unit_id": str(unit.id)},
            )
        ).json()["id"]

        # A facility admin at the callee facility sees the call in the scoped log.
        from app.models.user import UserFacilityRole, Role
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        # Give the admin a FACILITY_ADMIN grant at the recipient's facility.
        role = await db_session.scalar(
            __import__("sqlalchemy").select(Role).where(Role.name == "FACILITY_ADMIN")
        )
        db_session.add(UserFacilityRole(user_id=admin.user.id, facility_id=recipient.facility.id, role_id=role.id))
        await db_session.commit()
        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(str(admin.user.id), ['FACILITY_ADMIN'], str(recipient.facility.id))}"}
        log = await client.get(f"{CALLS}/in-app/log?status=RINGING", headers=headers)
        assert log.status_code == 200
        assert any(c["id"] == call_id for c in log.json())

    async def test_list_in_app_calls_by_referral(self, client, make_auth, db_session):
        unit, recipient = await self._recipient_in_unit(make_auth, db_session)
        caller = await make_auth(roles=("CLINICIAN",))
        await client.post(
            f"{CALLS}/in-app", headers=caller.headers,
            json={"facility_id": str(recipient.facility.id), "unit_id": str(unit.id)},
        )
        # Filtering by a random referral id yields an empty (but valid) list.
        resp = await client.get(f"{CALLS}/in-app?referral_id={uuid.uuid4()}", headers=caller.headers)
        assert resp.status_code == 200
        assert resp.json() == []


class TestAmbulanceErrors:
    async def test_update_unknown_ambulance_not_found(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.patch(f"{AMB}/{uuid.uuid4()}", headers=admin.headers, json={"driver_name": "x"})
        assert resp.status_code == 404

    async def test_reset_unknown_ambulance_not_found(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(f"{AMB}/{uuid.uuid4()}/reset-password", headers=admin.headers)
        assert resp.status_code == 404

    async def test_update_plate_clash_rejected(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        await _ambulance(db_session, admin.facility.id, plate="RAD-AAA")
        amb2 = await _ambulance(db_session, admin.facility.id, plate="RAD-BBB")
        resp = await client.patch(f"{AMB}/{amb2.id}", headers=admin.headers, json={"plate_number": "RAD-AAA"})
        assert resp.status_code == 422

    async def test_available_filter_excludes_on_journey(self, client, make_auth, db_session):
        from app.services.referral_service import ReferralService
        from app.schemas.referral import ReferralCreate
        from app.models.resource import Resource

        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        res = Resource(resource_name="Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=1)
        db_session.add(res)
        amb = await _ambulance(db_session, admin.facility.id, plate="RAD-ONJOB")
        referral = await ReferralService(db_session).create(
            ReferralCreate(sex="M", diagnosis="d", reason_for_transfer="r",
                           preferred_facility_id=admin.facility.id, requested_unit_id=unit.id,
                           requested_resource_ids=[res.id]),
            created_by=admin.user.id, referring_facility_id=admin.facility.id,
        )
        # A transport event with no arrival = the ambulance is on a journey.
        db_session.add(TransportEvent(referral_id=referral.id, ambulance_id=amb.id,
                                      ambulance_identifier="RAD-ONJOB", created_by=admin.user.id))
        await db_session.commit()
        resp = await client.get(f"{AMB}?available=true", headers=admin.headers)
        assert resp.status_code == 200
        assert all(a["id"] != str(amb.id) for a in resp.json())


class TestSpreadsheetReader:
    async def test_xlsx_import_roundtrip(self, client, make_auth):
        from openpyxl import Workbook

        admin = await make_auth(roles=("SUPER_ADMIN",))
        wb = Workbook()
        ws = wb.active
        ws.append(["name", "type"])
        ws.append(["Xlsx Hospital", "DISTRICT"])
        buf = io.BytesIO()
        wb.save(buf)
        resp = await client.post(
            "/api/v1/facilities/import",
            headers=admin.headers,
            files={"file": ("f.xlsx", buf.getvalue(),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp.status_code == 200
        assert resp.json()["created"] == 1

    async def test_corrupt_xlsx_is_rejected(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(
            "/api/v1/facilities/import",
            headers=admin.headers,
            files={"file": ("f.xlsx", b"not really xlsx",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp.status_code == 422

    async def test_semicolon_delimited_csv(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = "name;type\nSemicolon Clinic;DISTRICT\n".encode("utf-8")
        resp = await client.post(
            "/api/v1/facilities/import",
            headers=admin.headers,
            files={"file": ("f.csv", data, "text/csv")},
        )
        assert resp.status_code == 200
        assert resp.json()["created"] == 1
