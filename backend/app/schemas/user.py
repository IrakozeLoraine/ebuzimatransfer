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


class UserBase(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    phone: Optional[str] = None
    medical_id: str


class UserCreate(UserBase):
    password: str
    roles: List[str]

    @field_validator("roles")
    @classmethod
    def validate_roles(cls, v: List[str]) -> List[str]:
        for role in v:
            if role not in VALID_ROLES:
                raise ValueError(f"Invalid role: {role}")
        return v


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    roles: Optional[List[str]] = None

    @field_validator("roles")
    @classmethod
    def validate_roles(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            for role in v:
                if role not in VALID_ROLES:
                    raise ValueError(f"Invalid role: {role}")
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


class UserOut(UserBase):
    id: uuid.UUID
    is_active: bool
    account_status: str
    roles: List[RoleOut]
    facilities: List[FacilityRef] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class UserMe(BaseModel):
    id: uuid.UUID
    email: str
    medical_id: str
    first_name: str
    last_name: str
    roles: List[str]
    facilities: List[FacilityRef] = []
    account_status: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_user(cls, user) -> "UserMe":
        return cls(
            id=user.id,
            email=user.email,
            medical_id=user.medical_id,
            first_name=user.first_name,
            last_name=user.last_name,
            roles=user.role_names,
            facilities=[FacilityRef(id=f.id, name=f.name) for f in user.facilities],
            account_status=user.account_status,
        )
