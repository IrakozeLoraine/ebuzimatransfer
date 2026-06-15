from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import decode_token
from app.core.exceptions import UnauthorizedError, ForbiddenError
from app.db.session import get_session
from typing import List
import uuid

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


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

    return user


def require_roles(*roles: str):
    async def dependency(current_user=Depends(get_current_user)):
        user_roles = {r.name for r in current_user.roles}
        if not user_roles.intersection(roles):
            raise ForbiddenError()
        return current_user
    return dependency


def require_role(role: str):
    return require_roles(role)
