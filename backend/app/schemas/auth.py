from typing import Optional
from pydantic import BaseModel


class LoginRequest(BaseModel):
    medical_id: str
    password: Optional[str] = None


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
