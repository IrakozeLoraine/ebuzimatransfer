from __future__ import annotations
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import (
    verify_password,
    hash_password,
    create_access_token,
    create_refresh_token,
    create_password_reset_token,
    decode_token,
)
from app.core.exceptions import UnauthorizedError
from app.models.user import AccountStatus
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, TokenResponse, SetPasswordRequest


class AuthService:
    def __init__(self, session: AsyncSession):
        self.repo = UserRepository(session)
        self.session = session

    async def login(self, payload: LoginRequest) -> TokenResponse:
        user = await self.repo.get_by_medical_id(payload.medical_id)
        if not user or not user.is_active:
            raise UnauthorizedError("Invalid credentials")

        if user.account_status == AccountStatus.PASSWORD_RESET_ENABLED.value:
            reset_token = create_password_reset_token(str(user.id))
            return TokenResponse(requires_password_reset=True, reset_token=reset_token)

        # No password supplied → ID-check step; signal frontend to show the password field
        if payload.password is None:
            return TokenResponse(requires_password_reset=False)

        if not verify_password(payload.password, user.password_hash):
            raise UnauthorizedError("Invalid credentials")

        access = create_access_token(str(user.id), user.role_names)
        refresh = create_refresh_token(str(user.id))
        return TokenResponse(access_token=access, refresh_token=refresh)

    async def set_password(self, payload: SetPasswordRequest) -> TokenResponse:
        token_data = decode_token(payload.reset_token)
        if not token_data or token_data.get("type") != "password_reset":
            raise UnauthorizedError("Invalid or expired reset token")

        user = await self.repo.get_by_id(uuid.UUID(token_data["sub"]))
        if not user or not user.is_active:
            raise UnauthorizedError("User not found")

        user.password_hash = hash_password(payload.new_password)
        user.account_status = AccountStatus.ACTIVE.value
        await self.session.flush()

        access = create_access_token(str(user.id), user.role_names)
        refresh = create_refresh_token(str(user.id))
        return TokenResponse(access_token=access, refresh_token=refresh)

    async def refresh(self, refresh_token: str) -> TokenResponse:
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid refresh token")

        user = await self.repo.get_by_id(uuid.UUID(payload["sub"]))
        if not user or not user.is_active:
            raise UnauthorizedError("User not found or inactive")

        access = create_access_token(str(user.id), user.role_names)
        new_refresh = create_refresh_token(str(user.id))
        return TokenResponse(access_token=access, refresh_token=new_refresh)

    async def change_password(self, user_id: str, current: str, new: str) -> None:
        user = await self.repo.get_by_id(uuid.UUID(user_id))
        if not user or not verify_password(current, user.password_hash):
            raise UnauthorizedError("Current password is incorrect")
        user.password_hash = hash_password(new)
        await self.session.flush()
