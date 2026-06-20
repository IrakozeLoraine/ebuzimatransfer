from __future__ import annotations
import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, field_validator


VALID_ROLES = {
    "REFERRING_CLINICIAN",
    "ICU_COORDINATOR",
    "AMBULANCE_COORDINATOR",
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


class FacilityRolesOut(BaseModel):
    """The roles a user holds at one facility."""
    facility: FacilityRef
    roles: List[str]


class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    first_name: str
    last_name: str
    phone: Optional[str] = None
    medical_id: str

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none(cls, v):
        if v == "":
            return None
        return v


class UserCreate(UserBase):
    """Identity only — roles are granted per-facility via the assign endpoints."""
    password: str


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None

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

    @field_validator("roles")
    @classmethod
    def validate_roles(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("At least one role is required")
        for role in v:
            if role not in VALID_ROLES:
                raise ValueError(f"Invalid role: {role}")
        return v


def _facility_roles(user) -> List[FacilityRolesOut]:
    """Group a user's facility-scoped grants by facility."""
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
            roles=roles,
            active_facility_id=active_facility_id,
            facilities=[FacilityRef(id=f.id, name=f.name) for f in user.facilities],
            facility_roles=_facility_roles(user),
            account_status=user.account_status,
        )
