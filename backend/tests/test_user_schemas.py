"""Validation and serialization rules on the user schemas: blank emails coming
from HTML forms, role validation on assignment, and how a user's per-facility
role/unit grants are grouped for the API."""
import uuid
from types import SimpleNamespace

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.schemas.user import (
    ProfileUpdate,
    UserAssignRequest,
    UserBase,
    UserCreateAssign,
    UserStatusUpdate,
    UserUpdate,
    _facility_roles,
)


def _ref(name):
    return SimpleNamespace(id=uuid.uuid4(), name=name)


def _grant(facility, role_name):
    return SimpleNamespace(facility=facility, role=SimpleNamespace(name=role_name))


def _unit_grant(facility, unit):
    return SimpleNamespace(facility=facility, facility_id=facility.id, unit=unit, unit_id=unit.id)


class TestBlankEmail:
    # Web forms submit "" for an untouched optional email; that means "no email",
    # not an invalid address.
    def test_user_base_blank_email_becomes_none(self):
        user = UserBase(email="", first_name="A", last_name="B", medical_id="M-1")
        assert user.email is None

    def test_user_update_blank_email_becomes_none(self):
        assert UserUpdate(email="").email is None

    def test_profile_update_blank_email_becomes_none(self):
        assert ProfileUpdate(email="").email is None

    def test_profile_update_keeps_a_real_email(self):
        assert ProfileUpdate(email="a@b.rw").email == "a@b.rw"


class TestRoleValidation:
    def test_assign_request_rejects_empty_roles(self):
        with pytest.raises(PydanticValidationError, match="At least one role is required"):
            UserAssignRequest(medical_id="M-1", roles=[])

    def test_assign_request_rejects_unknown_role(self):
        with pytest.raises(PydanticValidationError, match="Invalid role: WIZARD"):
            UserAssignRequest(medical_id="M-1", roles=["WIZARD"])

    def test_create_assign_rejects_empty_roles(self):
        with pytest.raises(PydanticValidationError, match="At least one role is required"):
            UserCreateAssign(first_name="A", last_name="B", medical_id="M-1", roles=[])

    def test_create_assign_rejects_unknown_role(self):
        with pytest.raises(PydanticValidationError, match="Invalid role: PORTER"):
            UserCreateAssign(first_name="A", last_name="B", medical_id="M-1", roles=["PORTER"])


class TestStatusValidation:
    def test_unknown_status_rejected(self):
        with pytest.raises(PydanticValidationError, match="Invalid status: RETIRED"):
            UserStatusUpdate(account_status="RETIRED")

    @pytest.mark.parametrize("status", ["ACTIVE", "INACTIVE", "PASSWORD_RESET_ENABLED"])
    def test_known_statuses_accepted(self, status):
        assert UserStatusUpdate(account_status=status).account_status == status


class TestFacilityRolesGrouping:
    def test_multiple_roles_at_one_facility_are_grouped(self):
        facility = _ref("Kigali DH")
        user = SimpleNamespace(
            facility_roles=[_grant(facility, "CLINICIAN"), _grant(facility, "FACILITY_ADMIN")],
            facility_units=[],
        )
        entries = _facility_roles(user)
        assert len(entries) == 1
        assert entries[0].roles == ["CLINICIAN", "FACILITY_ADMIN"]

    def test_duplicate_role_grant_is_not_repeated(self):
        facility = _ref("Kigali DH")
        user = SimpleNamespace(
            facility_roles=[_grant(facility, "CLINICIAN"), _grant(facility, "CLINICIAN")],
            facility_units=[],
        )
        assert _facility_roles(user)[0].roles == ["CLINICIAN"]

    def test_grant_with_no_facility_is_skipped(self):
        user = SimpleNamespace(
            facility_roles=[SimpleNamespace(facility=None, role=SimpleNamespace(name="CLINICIAN"))],
            facility_units=[],
        )
        assert _facility_roles(user) == []

    def test_unit_without_a_role_grant_still_appears(self):
        # A user can be placed in a unit at a facility they hold no role at; the
        # facility must still show up, with an empty role list.
        facility = _ref("Kigali DH")
        unit = _ref("ICU")
        user = SimpleNamespace(facility_roles=[], facility_units=[_unit_grant(facility, unit)])
        entries = _facility_roles(user)
        assert len(entries) == 1
        assert entries[0].roles == []
        assert [u.name for u in entries[0].units] == ["ICU"]

    def test_duplicate_unit_membership_is_not_repeated(self):
        facility = _ref("Kigali DH")
        unit = _ref("ICU")
        user = SimpleNamespace(
            facility_roles=[_grant(facility, "CLINICIAN")],
            facility_units=[_unit_grant(facility, unit), _unit_grant(facility, unit)],
        )
        assert len(_facility_roles(user)[0].units) == 1

    def test_unit_grant_missing_facility_or_unit_is_skipped(self):
        facility = _ref("Kigali DH")
        unit = _ref("ICU")
        user = SimpleNamespace(
            facility_roles=[],
            facility_units=[
                SimpleNamespace(facility=None, facility_id=facility.id, unit=unit, unit_id=unit.id),
                SimpleNamespace(facility=facility, facility_id=facility.id, unit=None, unit_id=None),
            ],
        )
        assert _facility_roles(user) == []
