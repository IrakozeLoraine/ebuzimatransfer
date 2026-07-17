"""Admin-side user management: which facility a bulk import lands in, and the
account-status / profile-edit / import branches of ``UserService``."""
import uuid
from types import SimpleNamespace

import pytest

from app.api.users import _resolve_import_facility
from app.core.exceptions import ForbiddenError, ValidationError
from app.models.facility import Facility
from app.models.unit import Unit
from app.models.user import AccountStatus
from app.schemas.user import UserCreate, UserUpdate
from app.services.user_service import UserService


def _admin(roles, facilities, active=None):
    return SimpleNamespace(
        effective_roles=list(roles),
        facilities=[SimpleNamespace(id=f) for f in facilities],
        active_facility_id=active,
    )


def _csv(rows):
    return "\n".join(",".join(str(c) for c in row) for row in rows).encode("utf-8")


class TestResolveImportFacility:
    """Super admins name the target facility; facility admins can only ever import
    into a facility they belong to."""

    def test_super_admin_must_name_a_facility(self):
        with pytest.raises(ValidationError):
            _resolve_import_facility(_admin(["SUPER_ADMIN"], []), None)

    def test_super_admin_uses_the_requested_facility(self):
        target = uuid.uuid4()
        assert _resolve_import_facility(_admin(["SUPER_ADMIN"], []), target) == target

    def test_facility_admin_falls_back_to_active_facility(self):
        own = uuid.uuid4()
        admin = _admin(["FACILITY_ADMIN"], [own, uuid.uuid4()], active=own)
        assert _resolve_import_facility(admin, None) == own

    def test_facility_admin_with_one_facility_needs_no_active_context(self):
        own = uuid.uuid4()
        admin = _admin(["FACILITY_ADMIN"], [own], active=None)
        assert _resolve_import_facility(admin, None) == own

    def test_facility_admin_with_several_facilities_and_no_context_forbidden(self):
        admin = _admin(["FACILITY_ADMIN"], [uuid.uuid4(), uuid.uuid4()], active=None)
        with pytest.raises(ForbiddenError):
            _resolve_import_facility(admin, None)

    def test_facility_admin_cannot_import_into_another_facility(self):
        own = uuid.uuid4()
        admin = _admin(["FACILITY_ADMIN"], [own], active=own)
        with pytest.raises(ForbiddenError):
            _resolve_import_facility(admin, uuid.uuid4())

    def test_facility_admin_may_name_their_own_facility(self):
        own = uuid.uuid4()
        admin = _admin(["FACILITY_ADMIN"], [own], active=own)
        assert _resolve_import_facility(admin, own) == own


class TestAccountStatus:
    async def test_reactivating_restores_login(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        svc = UserService(db_session)
        user = await svc.create_user(UserCreate(medical_id="ST-1", first_name="A", last_name="B"))
        await svc.assign_roles(user.medical_id, admin.facility.id, ["CLINICIAN"])

        await svc.set_account_status(user.id, AccountStatus.INACTIVE.value, None)
        assert user.is_active is False

        await svc.set_account_status(user.id, AccountStatus.ACTIVE.value, None)
        assert user.is_active is True

    async def test_password_reset_status_leaves_active_flag_alone(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        svc = UserService(db_session)
        user = await svc.create_user(UserCreate(medical_id="ST-2", first_name="A", last_name="B"))
        await svc.assign_roles(user.medical_id, admin.facility.id, ["CLINICIAN"])

        await svc.set_account_status(user.id, AccountStatus.PASSWORD_RESET_ENABLED.value, None)
        assert user.account_status == AccountStatus.PASSWORD_RESET_ENABLED.value
        assert user.is_active is True

    async def test_facility_admin_cannot_touch_an_outside_user(self, db_session, make_auth):
        svc = UserService(db_session)
        user = await svc.create_user(UserCreate(medical_id="ST-3", first_name="A", last_name="B"))
        await db_session.commit()
        with pytest.raises(ForbiddenError):
            await svc.set_account_status(user.id, AccountStatus.INACTIVE.value, uuid.uuid4())


class TestUpdateUser:
    async def test_email_can_be_changed_and_cleared(self, db_session):
        svc = UserService(db_session)
        user = await svc.create_user(
            UserCreate(medical_id="UP-1", first_name="A", last_name="B", email="old@x.rw")
        )
        await db_session.commit()

        await svc.update_user(user.id, UserUpdate(email="new@x.rw"))
        assert user.email == "new@x.rw"

        # An explicit blank clears the address rather than tripping the clash check.
        await svc.update_user(user.id, UserUpdate(email=""))
        assert user.email is None

    async def test_email_already_taken_is_rejected(self, db_session):
        from app.core.exceptions import ConflictError

        svc = UserService(db_session)
        await svc.create_user(
            UserCreate(medical_id="UP-2", first_name="O", last_name="W", email="taken@x.rw")
        )
        user = await svc.create_user(UserCreate(medical_id="UP-3", first_name="A", last_name="B"))
        await db_session.commit()

        with pytest.raises(ConflictError):
            await svc.update_user(user.id, UserUpdate(email="taken@x.rw"))


class TestImportBranches:
    async def test_import_into_deactivated_facility_rejected(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        facility = await db_session.get(Facility, admin.facility.id)
        facility.is_active = False
        await db_session.commit()

        with pytest.raises(ValidationError, match="deactivated facility"):
            await UserService(db_session).import_users(
                _csv([["medical_id"], ["X-1"]]), admin.facility.id, is_csv=True
            )

    async def test_import_into_unknown_facility_not_found(self, db_session):
        from app.core.exceptions import NotFoundError

        with pytest.raises(NotFoundError):
            await UserService(db_session).import_users(b"medical_id\n", uuid.uuid4(), is_csv=True)

    async def test_empty_file_imports_nothing(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        result = await UserService(db_session).import_users(b"", admin.facility.id, is_csv=True)
        assert (result.created, result.assigned, result.errors) == (0, 0, [])

    async def test_blank_rows_are_skipped_silently(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = _csv([
            ["medical_id", "first_name", "last_name"],
            ["", "", ""],
            ["BLANK-1", "Ann", "Nk"],
        ])
        result = await UserService(db_session).import_users(data, admin.facility.id, is_csv=True)
        assert result.created == 1
        assert result.errors == []

    async def test_unit_above_the_facility_tier_is_an_error(self, db_session, make_auth):
        # A district hospital cannot staff a national-referral-only unit, so the
        # row is rejected rather than silently assigned.
        admin = await make_auth(roles=("SUPER_ADMIN",), facility_type="DISTRICT")
        db_session.add(Unit(name="Neurosurgery", tier="NRH_UTH"))
        await db_session.commit()

        data = _csv([
            ["medical_id", "first_name", "last_name", "units"],
            ["TIER-1", "Ann", "Nk", "Neurosurgery"],
        ])
        result = await UserService(db_session).import_users(data, admin.facility.id, is_csv=True)
        assert result.created == 0
        assert "not available at this facility" in result.errors[0].message

    async def test_unknown_unit_is_an_error(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = _csv([
            ["medical_id", "first_name", "last_name", "units"],
            ["UNIT-X", "Ann", "Nk", "Atlantis Ward"],
        ])
        result = await UserService(db_session).import_users(data, admin.facility.id, is_csv=True)
        assert result.created == 0
        assert "Atlantis Ward" in result.errors[0].message

    async def test_empty_unit_tokens_are_ignored(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",), facility_type="NRH_UTH")
        db_session.add(Unit(name="ICU", tier="DISTRICT"))
        await db_session.commit()

        data = _csv([
            ["medical_id", "first_name", "last_name", "units"],
            ["SEP-1", "Ann", "Nk", "ICU;;"],
        ])
        result = await UserService(db_session).import_users(data, admin.facility.id, is_csv=True)
        assert result.created == 1 and result.errors == []

    async def test_super_admin_role_cannot_be_granted_by_import(self, db_session, make_auth):
        admin = await make_auth(roles=("SUPER_ADMIN",))
        data = _csv([
            ["medical_id", "first_name", "last_name", "roles"],
            ["ESC-1", "Ann", "Nk", "SUPER_ADMIN"],
        ])
        result = await UserService(db_session).import_users(data, admin.facility.id, is_csv=True)
        assert result.created == 0
        assert "Invalid role(s): SUPER_ADMIN" in result.errors[0].message
