from __future__ import annotations
import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, field_validator


VALID_ROLES = {
    "CLINICIAN",
    "FACILITY_ADMIN",
    "SUPER_ADMIN",
}


class RoleOut(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class FacilityRef(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class UnitRef(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class FacilityRolesOut(BaseModel):
    """The roles a user holds — and the clinical units they work in — at one facility."""
    facility: FacilityRef
    roles: List[str]
    units: List[UnitRef] = []


class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    first_name: str
    last_name: str
    phone: Optional[str] = None
    location: Optional[str] = None
    medical_id: str

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none(cls, v):
        if v == "":
            return None
        return v


class UserCreate(UserBase):
    """Identity only. No password — new users start in PASSWORD_RESET_ENABLED and
    set their own password on first login. Roles are granted per-facility via assign."""
    pass


class UserCreateAssign(UserCreate):
    """Create a new user and grant them roles at a facility in one step.

    Used when an admin tries to assign someone who isn't registered yet.
    ``facility_id`` is required for super admins; facility admins use their own.
    """
    roles: List[str]
    unit_ids: List[uuid.UUID] = []
    facility_id: Optional[uuid.UUID] = None

    @field_validator("roles")
    @classmethod
    def validate_roles(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("At least one role is required")
        for role in v:
            if role not in VALID_ROLES:
                raise ValueError(f"Invalid role: {role}")
        return v


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    email: Optional[EmailStr] = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none(cls, v):
        if v == "":
            return None
        return v


class ProfileUpdate(BaseModel):
    """Self-service profile update: a user may change their own contact details."""
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    location: Optional[str] = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none(cls, v):
        if v == "":
            return None
        return v


class UserStatusUpdate(BaseModel):
    account_status: str

    @field_validator("account_status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed = {"ACTIVE", "INACTIVE", "PASSWORD_RESET_ENABLED"}
        if v not in allowed:
            raise ValueError(f"Invalid status: {v}")
        return v


class UserAssignRequest(BaseModel):
    medical_id: str
    roles: List[str]
    unit_ids: List[uuid.UUID] = []

    @field_validator("roles")
    @classmethod
    def validate_roles(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("At least one role is required")
        for role in v:
            if role not in VALID_ROLES:
                raise ValueError(f"Invalid role: {role}")
        return v


class UserImportError(BaseModel):
    row: int
    message: str


class UserImportResult(BaseModel):
    """Outcome of a bulk user import: how many new identities were created, how
    many users were (re)assigned at the facility, and any skipped rows."""
    created: int
    assigned: int
    errors: List[UserImportError] = []


def _facility_roles(user) -> List[FacilityRolesOut]:
    """Group a user's facility-scoped role grants and unit memberships by facility."""
    grouped: dict[uuid.UUID, FacilityRolesOut] = {}
    for fr in user.facility_roles:
        if fr.facility is None:
            continue
        entry = grouped.get(fr.facility.id)
        if entry is None:
            grouped[fr.facility.id] = FacilityRolesOut(
                facility=FacilityRef(id=fr.facility.id, name=fr.facility.name),
                roles=[fr.role.name],
            )
        elif fr.role.name not in entry.roles:
            entry.roles.append(fr.role.name)

    # Attach the clinical units the user works in at each facility. A unit may be
    # set for a facility the user has no role grant at, so create the entry if missing.
    for fu in getattr(user, "facility_units", []):
        if fu.facility is None or fu.unit is None:
            continue
        entry = grouped.get(fu.facility_id)
        if entry is None:
            entry = grouped[fu.facility_id] = FacilityRolesOut(
                facility=FacilityRef(id=fu.facility.id, name=fu.facility.name),
                roles=[],
            )
        if all(u.id != fu.unit_id for u in entry.units):
            entry.units.append(UnitRef(id=fu.unit.id, name=fu.unit.name))
    return list(grouped.values())


class UserOut(UserBase):
    id: uuid.UUID
    is_active: bool
    account_status: str
    facility_roles: List[FacilityRolesOut] = []
    global_roles: List[str] = []
    facilities: List[FacilityRef] = []
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_user(cls, user) -> "UserOut":
        return cls(
            id=user.id,
            email=user.email,
            medical_id=user.medical_id,
            first_name=user.first_name,
            last_name=user.last_name,
            phone=user.phone,
            location=user.location,
            is_active=user.is_active,
            account_status=user.account_status,
            facility_roles=_facility_roles(user),
            global_roles=user.global_role_names,
            facilities=[FacilityRef(id=f.id, name=f.name) for f in user.facilities],
            created_at=user.created_at,
        )


class UserMe(BaseModel):
    id: uuid.UUID
    email: Optional[EmailStr] = None
    medical_id: str
    first_name: str
    last_name: str
    phone: Optional[str] = None
    location: Optional[str] = None
    unit_ids: List[uuid.UUID] = []
    active_unit_id: Optional[uuid.UUID] = None
    roles: List[str]
    active_facility_id: Optional[uuid.UUID] = None
    facilities: List[FacilityRef] = []
    facility_roles: List[FacilityRolesOut] = []
    account_status: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_user(cls, user) -> "UserMe":
        active_facility_id = getattr(user, "active_facility_id", None)
        roles = getattr(user, "effective_roles", None)
        if roles is None:
            roles = user.effective_role_names(active_facility_id)
        return cls(
            id=user.id,
            email=user.email,
            medical_id=user.medical_id,
            first_name=user.first_name,
            last_name=user.last_name,
            phone=user.phone,
            location=user.location,
            unit_ids=[fu.unit_id for fu in user.units_for_facility(active_facility_id)],
            active_unit_id=getattr(user, "active_unit_id", None),
            roles=roles,
            active_facility_id=active_facility_id,
            facilities=[FacilityRef(id=f.id, name=f.name) for f in user.facilities],
            facility_roles=_facility_roles(user),
            account_status=user.account_status,
        )
