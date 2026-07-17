from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import decode_token
from app.core.exceptions import UnauthorizedError, ForbiddenError
from app.db.session import get_session
import uuid

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_ambulance(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
):
    """Authenticate the driver's phone app via its ambulance login token."""
    from app.models.ambulance import Ambulance

    payload = decode_token(token)
    if not payload or payload.get("type") != "driver":
        raise UnauthorizedError("Invalid or expired driver token")
    sub = payload.get("sub")
    if not sub:
        raise UnauthorizedError("Token missing subject")
    ambulance = await session.get(Ambulance, uuid.UUID(sub))
    if not ambulance or not ambulance.is_active:
        raise UnauthorizedError("Ambulance not found or inactive")
    return ambulance


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

    # Resolve the active facility and clinical unit from the token and attach
    # request-scoped authorization context onto the user instance.
    raw_facility = payload.get("active_facility_id")
    active_facility_id = uuid.UUID(raw_facility) if raw_facility else None
    raw_unit = payload.get("active_unit_id")
    user.active_facility_id = active_facility_id
    user.active_unit_id = uuid.UUID(raw_unit) if raw_unit else None
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
