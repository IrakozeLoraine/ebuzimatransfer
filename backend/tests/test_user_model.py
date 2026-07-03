"""Unit tests for role/unit resolution logic on the User model.

The model methods are pure Python over the loaded relationship collections, so
we build in-memory instances (no database session required).
"""
import uuid

import pytest

from app.models.user import User, UserFacilityRole, UserFacilityUnit, Role


def make_role_grant(role_name: str, facility_id: uuid.UUID | None):
    grant = UserFacilityRole()
    grant.role = Role(name=role_name)
    grant.facility_id = facility_id
    grant.facility = None
    return grant


def make_unit_membership(facility_id: uuid.UUID, unit_id: uuid.UUID):
    membership = UserFacilityUnit()
    membership.facility_id = facility_id
    membership.unit_id = unit_id
    return membership


def make_user(grants=(), units=()):
    user = User(
        first_name="Ada",
        last_name="Uwase",
        medical_id="MED-1",
        password_hash="hash",
    )
    user.facility_roles = list(grants)
    user.facility_units = list(units)
    return user


class TestFullName:
    def test_full_name_joins_first_and_last(self):
        user = make_user()
        assert user.full_name == "Ada Uwase"


class TestRoleResolution:
    def setup_method(self):
        self.fac_a = uuid.uuid4()
        self.fac_b = uuid.uuid4()

    def test_global_role_names_only_include_null_facility_grants(self):
        user = make_user(
            grants=[
                make_role_grant("SUPER_ADMIN", None),
                make_role_grant("CLINICIAN", self.fac_a),
            ]
        )
        assert user.global_role_names == ["SUPER_ADMIN"]

    def test_global_role_names_are_sorted_and_deduped(self):
        user = make_user(
            grants=[
                make_role_grant("SUPER_ADMIN", None),
                make_role_grant("FACILITY_ADMIN", None),
                make_role_grant("SUPER_ADMIN", None),
            ]
        )
        assert user.global_role_names == ["FACILITY_ADMIN", "SUPER_ADMIN"]

    def test_roles_for_facility_scopes_by_facility(self):
        user = make_user(
            grants=[
                make_role_grant("CLINICIAN", self.fac_a),
                make_role_grant("FACILITY_ADMIN", self.fac_b),
            ]
        )
        assert user.roles_for_facility(self.fac_a) == ["CLINICIAN"]
        assert user.roles_for_facility(self.fac_b) == ["FACILITY_ADMIN"]

    def test_roles_for_facility_none_returns_empty(self):
        user = make_user(grants=[make_role_grant("CLINICIAN", self.fac_a)])
        assert user.roles_for_facility(None) == []

    def test_effective_roles_combine_global_and_facility(self):
        user = make_user(
            grants=[
                make_role_grant("SUPER_ADMIN", None),
                make_role_grant("CLINICIAN", self.fac_a),
                make_role_grant("FACILITY_ADMIN", self.fac_b),
            ]
        )
        assert user.effective_role_names(self.fac_a) == ["CLINICIAN", "SUPER_ADMIN"]

    def test_effective_roles_with_no_active_facility_is_global_only(self):
        user = make_user(
            grants=[
                make_role_grant("SUPER_ADMIN", None),
                make_role_grant("CLINICIAN", self.fac_a),
            ]
        )
        assert user.effective_role_names(None) == ["SUPER_ADMIN"]


class TestUnitResolution:
    def setup_method(self):
        self.fac_a = uuid.uuid4()
        self.fac_b = uuid.uuid4()

    def test_unit_ids_are_deduplicated_across_facilities(self):
        shared_unit = uuid.uuid4()
        user = make_user(
            units=[
                make_unit_membership(self.fac_a, shared_unit),
                make_unit_membership(self.fac_b, shared_unit),
            ]
        )
        assert user.unit_ids == [shared_unit]

    def test_units_for_facility_filters_by_facility(self):
        unit_a, unit_b = uuid.uuid4(), uuid.uuid4()
        user = make_user(
            units=[
                make_unit_membership(self.fac_a, unit_a),
                make_unit_membership(self.fac_b, unit_b),
            ]
        )
        result = user.units_for_facility(self.fac_a)
        assert [m.unit_id for m in result] == [unit_a]

    def test_units_for_facility_none_returns_empty(self):
        user = make_user(units=[make_unit_membership(self.fac_a, uuid.uuid4())])
        assert user.units_for_facility(None) == []
