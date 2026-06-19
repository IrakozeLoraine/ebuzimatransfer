import uuid
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_roles, get_current_user
from app.services.user_service import UserService
from app.services.audit_service import AuditService
from app.schemas.user import UserCreate, UserUpdate, UserOut, UserStatusUpdate, UserAssignRequest

router = APIRouter()


@router.get("", response_model=List[UserOut])
async def list_users(
    limit: int = 100,
    offset: int = 0,
    current_user=Depends(require_roles("SUPER_ADMIN", "FACILITY_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = UserService(session)
    user_roles = {r.name for r in current_user.roles}
    if "SUPER_ADMIN" in user_roles:
        return await svc.list_users(limit=limit, offset=offset)
    primary = current_user.primary_facility_id
    if primary is None:
        return []
    return await svc.list_users_for_facility(primary)


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    payload: UserCreate,
    current_user=Depends(require_roles("SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = UserService(session)
    user = await svc.create_user(payload)
    await AuditService(session).log("CREATE_USER", "user", user_id=current_user.id, entity_id=user.id)
    await session.commit()
    await session.refresh(user)
    return user


@router.post("/assign", response_model=UserOut)
async def assign_user_to_facility(
    payload: UserAssignRequest,
    current_user=Depends(require_roles("FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = UserService(session)
    user_roles = {r.name for r in current_user.roles}
    facility_id = (
        None if "SUPER_ADMIN" in user_roles else current_user.primary_facility_id
    )
    if facility_id is None and "SUPER_ADMIN" not in user_roles:
        from app.core.exceptions import ForbiddenError
        raise ForbiddenError("No facility associated with this admin")

    if "SUPER_ADMIN" in user_roles:
        from app.core.exceptions import ValidationError
        raise ValidationError("SUPER_ADMIN must provide facility_id via /assign/{facility_id}")

    user = await svc.assign_to_facility(payload.medical_id, facility_id)
    await AuditService(session).log("ASSIGN_USER", "user", user_id=current_user.id, entity_id=user.id)
    await session.commit()
    return user


@router.post("/assign/{facility_id}", response_model=UserOut)
async def assign_user_to_specific_facility(
    facility_id: uuid.UUID,
    payload: UserAssignRequest,
    current_user=Depends(require_roles("SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = UserService(session)
    user = await svc.assign_to_facility(payload.medical_id, facility_id)
    await AuditService(session).log("ASSIGN_USER", "user", user_id=current_user.id, entity_id=user.id)
    await session.commit()
    return user


@router.patch("/{user_id}/status", response_model=UserOut)
async def set_user_status(
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    current_user=Depends(require_roles("FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = UserService(session)
    user_roles = {r.name for r in current_user.roles}
    acting_facility_id = None if "SUPER_ADMIN" in user_roles else current_user.primary_facility_id
    user = await svc.set_account_status(user_id, payload.account_status, acting_facility_id)
    await AuditService(session).log("SET_USER_STATUS", "user", user_id=current_user.id, entity_id=user_id)
    await session.commit()
    return user


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: uuid.UUID,
    current_user=Depends(require_roles("SUPER_ADMIN", "FACILITY_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    return await UserService(session).get_user(user_id)


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    current_user=Depends(require_roles("SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = UserService(session)
    user = await svc.update_user(user_id, payload)
    await AuditService(session).log("UPDATE_USER", "user", user_id=current_user.id, entity_id=user_id)
    await session.commit()
    return user


@router.delete("/{user_id}")
async def deactivate_user(
    user_id: uuid.UUID,
    current_user=Depends(require_roles("SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    await UserService(session).deactivate_user(user_id)
    await AuditService(session).log("DEACTIVATE_USER", "user", user_id=current_user.id, entity_id=user_id)
    await session.commit()
    return {"success": True, "message": "User deactivated"}
