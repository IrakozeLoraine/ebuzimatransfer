"""Final targeted coverage pass: resource service split/merge & import branches,
user-import reassign/clash paths, schema serialization of unit memberships, phone
line & transport error paths, auth guards, the location seed module, the base
repository, and the WebSocket Redis listener loop."""
import uuid

import pytest
import pytest_asyncio

from app.core.exceptions import NotFoundError, ValidationError
from app.core.security import create_access_token, create_driver_token, create_refresh_token
from app.models.unit import Unit
from app.models.resource import Resource
from app.models.facility import Facility
from app.models.user import UserFacilityUnit
from app.models.call import FacilityPhoneLine, PhoneLineType
from app.services.resource_service import ResourceService
from app.services.user_service import UserService
from app.schemas.resource import ResourceCreate
from app.schemas.user import UserOut, UserMe

pytestmark = pytest.mark.asyncio


# --------------------------------------------------------------------------- #
# ResourceService assign/remove/usage/import branches
# --------------------------------------------------------------------------- #

class TestResourceServiceBranches:
    async def test_assign_whole_central_stock_relabels_in_place(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        stock = Resource(resource_name="Pool", quantity=3, out_of_service=3)
        db_session.add(stock)
        await db_session.commit()

        svc = ResourceService(db_session)
        out = await svc.assign(stock.id, admin.facility.id, unit.id, quantity=None)
        assert out.facility_id == admin.facility.id
        assert out.available == 3  # relabelled in place, now available

    async def test_assign_split_merges_into_existing_group(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        # Destination already has an identical group to merge into.
        existing = Resource(resource_name="Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=2)
        stock = Resource(resource_name="Bed", quantity=4, out_of_service=4)
        db_session.add_all([existing, stock])
        await db_session.commit()

        svc = ResourceService(db_session)
        out = await svc.assign(stock.id, admin.facility.id, unit.id, quantity=2)
        # The two split units merged into the existing group (2 + 2 = 4).
        assert out.id == existing.id
        assert out.quantity == 4

    async def test_remove_central_stock_to_zero_deletes(self, db_session, make_auth):
        await make_auth(roles=("SUPER_ADMIN",))
        stock = Resource(resource_name="Gone", quantity=2, out_of_service=2)
        db_session.add(stock)
        await db_session.commit()
        svc = ResourceService(db_session)
        await svc.remove_units(stock.id, 2)
        assert await db_session.get(Resource, stock.id) is None

    async def test_add_units_requires_positive(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        r = Resource(resource_name="Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=1)
        db_session.add(r)
        await db_session.commit()
        with pytest.raises(ValidationError):
            await ResourceService(db_session).add_units(r.id, 0)

    async def test_usage_unknown_resource_raises(self, db_session):
        with pytest.raises(NotFoundError):
            await ResourceService(db_session).usage(uuid.uuid4())

    async def test_assign_unit_without_facility_rejected(self, db_session, make_auth):
        await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        stock = Resource(resource_name="X", quantity=1, out_of_service=1)
        db_session.add_all([unit, stock])
        await db_session.commit()
        with pytest.raises(ValidationError):
            await ResourceService(db_session).assign(stock.id, None, unit.id)

    async def test_import_with_facility_tier_scoping_and_quantity_error(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",), facility_type="DISTRICT")
        db_session.add(Unit(name="Ward", tier="DISTRICT"))
        db_session.add(Unit(name="Advanced", tier="NRH_UTH"))  # above tier -> excluded
        await db_session.commit()
        csv = (
            "resource_name,quantity,unit\n"
            "Bed A,2,Ward\n"          # ok
            "Bed B,0,Ward\n"          # quantity < 1 -> error
            "Bed C,2,Advanced\n"     # unit not available at district tier -> error
        ).encode("utf-8")
        result = await ResourceService(db_session).import_from_excel(
            csv, default_facility_id=admin.facility.id, is_csv=True
        )
        assert result.created == 1
        assert len(result.errors) == 2


# --------------------------------------------------------------------------- #
# UserService import reassign / email-clash / unit branches
# --------------------------------------------------------------------------- #

class TestUserImport:
    async def test_import_reassigns_existing_and_flags_clashes(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        svc = UserService(db_session)
        # Pre-existing identity + a unit available at the facility.
        from app.schemas.user import UserCreate
        await svc.create_user(UserCreate(medical_id="EXIST-1", first_name="E", last_name="X"))
        unit = Unit(name="ICU", tier="NRH_UTH")
        db_session.add(unit)
        # Another user owns an email that a new import row will clash on.
        await svc.create_user(UserCreate(medical_id="OWNER-1", first_name="O", last_name="W", email="taken@x.rw"))
        await db_session.commit()

        csv = (
            "medical_id,first_name,last_name,email,roles,units\n"
            "EXIST-1,,,,CLINICIAN,ICU\n"            # existing -> reassigned (not re-created)
            "NEW-1,Ann,Nk,taken@x.rw,CLINICIAN,\n"  # email clash -> error
            "NEW-2,Ben,Mu,,CLINICIAN,ICU\n"          # new + unit assignment
        ).encode("utf-8")
        result = await svc.import_users(csv, admin.facility.id, is_csv=True)
        assert result.created == 1          # only NEW-2
        assert result.assigned == 2         # EXIST-1 and NEW-2
        assert len(result.errors) == 1      # the email clash

    async def test_import_missing_medical_id_column(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        csv = b"first_name,last_name\nAda,Uwase\n"
        with pytest.raises(ValidationError):
            await UserService(db_session).import_users(csv, admin.facility.id, is_csv=True)

    async def test_assign_roles_with_unit(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        svc = UserService(db_session)
        from app.schemas.user import UserCreate
        user = await svc.create_user(UserCreate(medical_id="UNIT-1", first_name="U", last_name="N"))
        unit = Unit(name="ICU", tier="NRH_UTH")
        db_session.add(unit)
        await db_session.commit()
        updated = await svc.assign_roles(user.medical_id, admin.facility.id, ["CLINICIAN"], [unit.id])
        assert any(fu.unit_id == unit.id for fu in updated.facility_units)


# --------------------------------------------------------------------------- #
# Schema serialization of unit memberships
# --------------------------------------------------------------------------- #

class TestUserSchemas:
    async def test_user_out_includes_unit_only_facility(self, db_session, make_auth):
        auth = await make_auth(roles=("CLINICIAN",))
        unit = Unit(name="ICU", tier="NRH_UTH")
        db_session.add(unit)
        await db_session.flush()
        # A unit membership at a *different* facility than any role grant.
        other = Facility(name="Unit-Only Facility", type="DISTRICT")
        db_session.add(other)
        await db_session.flush()
        db_session.add(UserFacilityUnit(user_id=auth.user.id, facility_id=other.id, unit_id=unit.id))
        await db_session.commit()

        refreshed = await UserService(db_session).get_user(auth.user.id)
        out = UserOut.from_user(refreshed)
        # The unit-only facility appears in facility_roles with an empty roles list.
        assert any(fr.facility.id == other.id and fr.units for fr in out.facility_roles)

    async def test_user_me_falls_back_to_computed_roles(self, db_session, make_auth):
        auth = await make_auth(roles=("CLINICIAN",))
        user = await UserService(db_session).get_user(auth.user.id)
        # No request-scoped effective_roles attached -> from_user computes them.
        me = UserMe.from_user(user)
        assert isinstance(me.roles, list)


# --------------------------------------------------------------------------- #
# Phone-line and transport error paths
# --------------------------------------------------------------------------- #

class TestCallAndTransportErrors:
    async def test_phone_line_create_unknown_facility(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.post(
            f"/api/v1/calls/phone-lines?facility_id={uuid.uuid4()}",
            headers=admin.headers, json={"label": "X", "phone_number": "1"},
        )
        assert resp.status_code == 404

    async def test_phone_line_create_deactivated_facility(self, client, make_auth, db_session):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        fac = await db_session.get(Facility, admin.facility.id)
        fac.is_active = False
        await db_session.commit()
        resp = await client.post(
            f"/api/v1/calls/phone-lines?facility_id={admin.facility.id}",
            headers=admin.headers, json={"label": "X", "phone_number": "1"},
        )
        assert resp.status_code == 422

    async def test_facility_admin_cannot_update_foreign_line(self, client, make_auth, db_session):
        admin = await make_auth(roles=("FACILITY_ADMIN",))
        other = await make_auth(roles=("CLINICIAN",))
        line = FacilityPhoneLine(facility_id=other.facility.id, label="L", phone_number="1",
                                 line_type=PhoneLineType.COORDINATION)
        db_session.add(line)
        await db_session.commit()
        resp = await client.put(
            f"/api/v1/calls/phone-lines/{line.id}", headers=admin.headers, json={"label": "z"}
        )
        assert resp.status_code == 403

    async def test_delete_unknown_line(self, client, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        resp = await client.delete(f"/api/v1/calls/phone-lines/{uuid.uuid4()}", headers=admin.headers)
        assert resp.status_code == 404

    async def test_list_calls_filtered_by_referral(self, client, make_auth):
        user = await make_auth(roles=("CLINICIAN",))
        resp = await client.get(f"/api/v1/calls/log?referral_id={uuid.uuid4()}", headers=user.headers)
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_transport_unknown_ambulance(self, client, make_auth, db_session):
        from app.services.referral_service import ReferralService
        from app.schemas.referral import ReferralCreate, AcceptReferralRequest
        from types import SimpleNamespace

        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        res = Resource(resource_name="Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=1)
        db_session.add(res)
        await db_session.flush()
        svc = ReferralService(db_session)
        referral = await svc.create(
            ReferralCreate(sex="M", diagnosis="d", reason_for_transfer="r",
                           preferred_facility_id=admin.facility.id, requested_unit_id=unit.id,
                           requested_resource_ids=[res.id]),
            created_by=admin.user.id, referring_facility_id=admin.facility.id,
        )
        actor = SimpleNamespace(id=admin.user.id, effective_roles=["SUPER_ADMIN"],
                                active_facility_id=admin.facility.id, facilities=[], unit_ids=[])
        await svc.accept(referral.id, AcceptReferralRequest(), actor)
        await db_session.commit()
        resp = await client.post(
            "/api/v1/transport", headers=admin.headers,
            json={"referral_id": str(referral.id), "ambulance_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 404

    async def test_remove_transport_when_none(self, client, make_auth, db_session):
        from app.services.referral_service import ReferralService
        from app.schemas.referral import ReferralCreate
        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        res = Resource(resource_name="Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=1)
        db_session.add(res)
        await db_session.flush()
        referral = await ReferralService(db_session).create(
            ReferralCreate(sex="M", diagnosis="d", reason_for_transfer="r",
                           preferred_facility_id=admin.facility.id, requested_unit_id=unit.id,
                           requested_resource_ids=[res.id]),
            created_by=admin.user.id, referring_facility_id=admin.facility.id,
        )
        await db_session.commit()
        resp = await client.delete(f"/api/v1/transport/{referral.id}", headers=admin.headers)
        assert resp.status_code == 404


# --------------------------------------------------------------------------- #
# Auth & permission guards
# --------------------------------------------------------------------------- #

class TestAuthGuards:
    async def test_set_password_bad_token(self, client):
        resp = await client.post(
            "/api/v1/auth/set-password", json={"reset_token": "garbage", "new_password": "New-Pass-1"}
        )
        assert resp.status_code == 401

    async def test_driver_endpoint_rejects_staff_token(self, client, make_auth):
        # A normal access token has type "access", not "driver".
        auth = await make_auth(roles=("CLINICIAN",))
        resp = await client.get("/api/v1/driver/journey", headers=auth.headers)
        assert resp.status_code == 401

    async def test_driver_token_for_missing_ambulance(self, client):
        token = create_driver_token(str(uuid.uuid4()))
        resp = await client.get(
            "/api/v1/driver/journey", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 401

    async def test_access_token_for_missing_user(self, client):
        token = create_access_token(str(uuid.uuid4()), ["CLINICIAN"], None)
        resp = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 401

    async def test_refresh_wrong_token_type(self, client, make_auth):
        # An access token can't be used to refresh (type mismatch).
        auth = await make_auth(roles=("CLINICIAN",))
        access = create_access_token(str(auth.user.id), ["CLINICIAN"], None)
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": access})
        assert resp.status_code == 401


# --------------------------------------------------------------------------- #
# Referral repository listing filters
# --------------------------------------------------------------------------- #

class TestReferralRepository:
    async def test_list_filters_and_transport_queue(self, db_session, make_auth):
        from app.services.referral_service import ReferralService
        from app.schemas.referral import ReferralCreate, AcceptReferralRequest
        from types import SimpleNamespace
        from app.models.referral import ReferralStatus

        admin = await make_auth(roles=("SUPER_ADMIN",))
        unit = Unit(name="ICU", tier="DISTRICT")
        db_session.add(unit)
        await db_session.flush()
        res = Resource(resource_name="Bed", facility_id=admin.facility.id, unit_id=unit.id, quantity=2)
        db_session.add(res)
        await db_session.flush()
        svc = ReferralService(db_session)
        referral = await svc.create(
            ReferralCreate(sex="M", diagnosis="d", reason_for_transfer="r",
                           preferred_facility_id=admin.facility.id, requested_unit_id=unit.id,
                           requested_resource_ids=[res.id]),
            created_by=admin.user.id, referring_facility_id=admin.facility.id,
        )
        actor = SimpleNamespace(id=admin.user.id, effective_roles=["SUPER_ADMIN"],
                                active_facility_id=admin.facility.id, facilities=[], unit_ids=[])
        await svc.accept(referral.id, AcceptReferralRequest(), actor)
        await db_session.commit()

        # list() with facility + created_by filters.
        by_facility = await svc.list(facility_id=admin.facility.id, created_by=admin.user.id)
        assert len(by_facility) >= 1
        # get_transport_queue returns ACCEPTED referrals awaiting transport.
        queue = await svc.get_transport_queue()
        assert any(r.id == referral.id for r in queue)
        # list_for_facilities with a status filter.
        scoped = await svc.repo.list_for_facilities([admin.facility.id], status=ReferralStatus.ACCEPTED)
        assert len(scoped) >= 1


# --------------------------------------------------------------------------- #
# Misc: location seed module, base repository, ws listener
# --------------------------------------------------------------------------- #

class TestMisc:
    def test_rwanda_locations_seed_loads(self):
        from app.data.rwanda_locations import LOCATIONS
        assert isinstance(LOCATIONS, dict)
        assert LOCATIONS  # non-empty official hierarchy

    async def test_base_repository_count_and_delete(self, db_session):
        from app.repositories.base import BaseRepository
        repo = BaseRepository(Facility, db_session)
        facility = Facility(name="Base Repo Facility", type="DISTRICT")
        created = await repo.create(facility)
        assert await repo.count() >= 1
        await repo.delete(created)
        assert await repo.get_by_id(created.id) is None

    async def test_ws_listener_relays_messages(self):
        import json as _json
        from app.websocket.manager import ConnectionManager

        class _Sock:
            def __init__(self):
                self.sent = []

            async def accept(self):
                pass

            async def send_json(self, m):
                self.sent.append(m)

        class _PubSub:
            async def listen(self):
                yield {"type": "pmessage", "channel": "ws:capacity", "data": _json.dumps({"event": "X"})}
                yield {"type": "subscribe", "channel": "ws:capacity", "data": 1}  # skipped
                yield {"type": "pmessage", "channel": "ws:capacity", "data": "not-json"}  # skipped

        mgr = ConnectionManager()
        sock = _Sock()
        await mgr.connect("capacity", sock)
        mgr._pubsub = _PubSub()
        await mgr._listen()
        assert sock.sent == [{"event": "X"}]
