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
from app.core.exceptions import UnauthorizedError, ForbiddenError
from app.models.user import AccountStatus, User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, TokenResponse, SetPasswordRequest


class AuthService:
    def __init__(self, session: AsyncSession):
        self.repo = UserRepository(session)
        self.session = session

    def _issue_tokens(
        self,
        user: User,
        active_facility_id: uuid.UUID | None,
        active_unit_id: uuid.UUID | None = None,
    ) -> TokenResponse:
        roles = user.effective_role_names(active_facility_id)
        access = create_access_token(
            str(user.id),
            roles,
            str(active_facility_id) if active_facility_id else None,
            str(active_unit_id) if active_unit_id else None,
        )
        refresh = create_refresh_token(str(user.id))
        return TokenResponse(access_token=access, refresh_token=refresh)

    @staticmethod
    def _default_facility_id(user: User) -> uuid.UUID | None:
        facilities = user.facilities
        return facilities[0].id if facilities else None

    @staticmethod
    def _default_unit_id(user: User, facility_id: uuid.UUID | None) -> uuid.UUID | None:
        """Auto-select the active unit only when the choice is unambiguous — i.e. the
        clinician works in exactly one unit at ``facility_id``. When they work in
        several, the unit is left unset so the frontend prompts them to pick one."""
        units = user.units_for_facility(facility_id)
        return units[0].unit_id if len(units) == 1 else None

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

        facility_id = self._default_facility_id(user)
        return self._issue_tokens(user, facility_id, self._default_unit_id(user, facility_id))

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

        facility_id = self._default_facility_id(user)
        return self._issue_tokens(user, facility_id, self._default_unit_id(user, facility_id))

    async def refresh(self, refresh_token: str) -> TokenResponse:
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid refresh token")

        user = await self.repo.get_by_id(uuid.UUID(payload["sub"]))
        if not user or not user.is_active:
            raise UnauthorizedError("User not found or inactive")

        facility_id = self._default_facility_id(user)
        return self._issue_tokens(user, facility_id, self._default_unit_id(user, facility_id))

    async def switch_context(
        self,
        user_id: str,
        facility_id: uuid.UUID,
        unit_id: uuid.UUID | None = None,
    ) -> TokenResponse:
        """Re-issue tokens for a different active facility and/or clinical unit.

        The user must be a member of ``facility_id`` (or hold a global role). When a
        ``unit_id`` is given it must be one of the units they work in at that facility;
        otherwise the active unit falls back to the unambiguous default (the sole unit,
        if any)."""
        user = await self.repo.get_by_id(uuid.UUID(user_id))
        if not user or not user.is_active:
            raise UnauthorizedError("User not found or inactive")

        member_facility_ids = {f.id for f in user.facilities}
        is_global = bool(user.global_role_names)
        if facility_id not in member_facility_ids and not is_global:
            raise ForbiddenError("You do not have access to this facility")

        if unit_id is not None:
            facility_unit_ids = {fu.unit_id for fu in user.units_for_facility(facility_id)}
            if unit_id not in facility_unit_ids:
                raise ForbiddenError("You do not work in this unit at the selected facility")
        else:
            unit_id = self._default_unit_id(user, facility_id)

        return self._issue_tokens(user, facility_id, unit_id)

    async def switch_facility(self, user_id: str, facility_id: uuid.UUID) -> TokenResponse:
        """Backwards-compatible facility-only switch; resets the active unit to the
        facility's default. Prefer :meth:`switch_context`."""
        return await self.switch_context(user_id, facility_id, None)

    async def change_password(self, user_id: str, current: str, new: str) -> None:
        user = await self.repo.get_by_id(uuid.UUID(user_id))
        if not user or not verify_password(current, user.password_hash):
            raise UnauthorizedError("Current password is incorrect")
        user.password_hash = hash_password(new)
        await self.session.flush()
