import uuid
from typing import Optional
from pydantic import BaseModel


class LoginRequest(BaseModel):
    medical_id: str
    password: Optional[str] = None


class SwitchFacilityRequest(BaseModel):
    facility_id: uuid.UUID


class SwitchContextRequest(BaseModel):
    """Set the active facility and (optionally) the active clinical unit. Omitting
    ``unit_id`` resets the unit to the facility's unambiguous default."""
    facility_id: uuid.UUID
    unit_id: Optional[uuid.UUID] = None


class TokenResponse(BaseModel):
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    requires_password_reset: bool = False
    reset_token: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class SetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str
