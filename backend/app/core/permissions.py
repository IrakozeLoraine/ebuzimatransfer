from fastapi import Depends, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import decode_token, hash_device_key
from app.core.exceptions import UnauthorizedError, ForbiddenError
from app.db.session import get_session
from typing import List
import uuid

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_device(
    x_device_key: str = Header(..., alias="X-Device-Key"),
    session: AsyncSession = Depends(get_session),
):
    """Authenticate a hardware GPS tracker by its API key (sent as ``X-Device-Key``)."""
    from app.models.ambulance import AmbulanceDevice

    device = await session.scalar(
        select(AmbulanceDevice).where(
            AmbulanceDevice.api_key_hash == hash_device_key(x_device_key),
            AmbulanceDevice.is_active.is_(True),
        )
    )
    if not device:
        raise UnauthorizedError("Invalid or inactive device key")
    return device


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
):
    from app.repositories.user_repository import UserRepository

    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise UnauthorizedError("Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError("Token missing subject")

    repo = UserRepository(session)
    user = await repo.get_by_id(uuid.UUID(user_id))
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive")

    # Resolve the active facility from the token and attach request-scoped
    # authorization context onto the user instance.
    raw_facility = payload.get("active_facility_id")
    active_facility_id = uuid.UUID(raw_facility) if raw_facility else None
    user.active_facility_id = active_facility_id
    user.effective_roles = user.effective_role_names(active_facility_id)

    return user


def require_roles(*roles: str):
    async def dependency(current_user=Depends(get_current_user)):
        if not set(current_user.effective_roles).intersection(roles):
            raise ForbiddenError()
        return current_user
    return dependency


def require_role(role: str):
    return require_roles(role)
