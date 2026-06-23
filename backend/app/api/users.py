import uuid
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_roles, get_current_user
from app.core.exceptions import ForbiddenError
from app.services.user_service import UserService
from app.services.audit_service import AuditService
from app.schemas.user import UserCreate, UserCreateAssign, UserUpdate, UserOut, UserStatusUpdate, UserAssignRequest

router = APIRouter()


@router.get("", response_model=List[UserOut])
async def list_users(
    limit: int = 100,
    offset: int = 0,
    current_user=Depends(require_roles("SUPER_ADMIN", "FACILITY_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = UserService(session)
    if "SUPER_ADMIN" in current_user.effective_roles:
        users = await svc.list_users(limit=limit, offset=offset)
    else:
        active = current_user.active_facility_id
        users = await svc.list_users_for_facility(active) if active else []
    return [UserOut.from_user(u) for u in users]


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
    return UserOut.from_user(user)


@router.post("/create-and-assign", response_model=UserOut, status_code=201)
async def create_and_assign_user(
    payload: UserCreateAssign,
    current_user=Depends(require_roles("FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """Register a new user and assign them to a facility in one step — used when an
    admin assigns someone who isn't registered yet."""
    svc = UserService(session)
    if "SUPER_ADMIN" in current_user.effective_roles:
        if payload.facility_id is None:
            from app.core.exceptions import ValidationError
            raise ValidationError("facility_id is required")
        facility_id = payload.facility_id
    else:
        facility_id = current_user.active_facility_id
        if facility_id is None:
            from app.core.exceptions import ForbiddenError
            raise ForbiddenError("No facility associated with this admin")

    user = await svc.create_and_assign(payload, facility_id, payload.roles, payload.unit_ids)
    await AuditService(session).log("CREATE_USER", "user", user_id=current_user.id, entity_id=user.id)
    await session.commit()
    return UserOut.from_user(user)


@router.post("/assign", response_model=UserOut)
async def assign_user_to_facility(
    payload: UserAssignRequest,
    current_user=Depends(require_roles("FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """Facility admins assign roles within their active facility."""
    svc = UserService(session)
    if "SUPER_ADMIN" in current_user.effective_roles:
        from app.core.exceptions import ValidationError
        raise ValidationError("SUPER_ADMIN must provide facility_id via /assign/{facility_id}")

    facility_id = current_user.active_facility_id
    if facility_id is None:
        from app.core.exceptions import ForbiddenError
        raise ForbiddenError("No facility associated with this admin")

    user = await svc.assign_roles(payload.medical_id, facility_id, payload.roles, payload.unit_ids)
    await AuditService(session).log("ASSIGN_USER", "user", user_id=current_user.id, entity_id=user.id)
    await session.commit()
    return UserOut.from_user(user)


@router.post("/assign/{facility_id}", response_model=UserOut)
async def assign_user_to_specific_facility(
    facility_id: uuid.UUID,
    payload: UserAssignRequest,
    current_user=Depends(require_roles("SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = UserService(session)
    user = await svc.assign_roles(payload.medical_id, facility_id, payload.roles, payload.unit_ids)
    await AuditService(session).log("ASSIGN_USER", "user", user_id=current_user.id, entity_id=user.id)
    await session.commit()
    return UserOut.from_user(user)


@router.delete("/{user_id}/facilities/{facility_id}", response_model=UserOut)
async def remove_user_from_facility(
    user_id: uuid.UUID,
    facility_id: uuid.UUID,
    current_user=Depends(require_roles("SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """Remove all of a user's role grants at a facility. Super admins only."""
    svc = UserService(session)
    user = await svc.remove_from_facility(user_id, facility_id)
    await AuditService(session).log("UNASSIGN_USER", "user", user_id=current_user.id, entity_id=user.id)
    await session.commit()
    return UserOut.from_user(user)


@router.patch("/{user_id}/status", response_model=UserOut)
async def set_user_status(
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    current_user=Depends(require_roles("FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = UserService(session)
    acting_facility_id = (
        None if "SUPER_ADMIN" in current_user.effective_roles else current_user.active_facility_id
    )
    user = await svc.set_account_status(user_id, payload.account_status, acting_facility_id)
    await AuditService(session).log("SET_USER_STATUS", "user", user_id=current_user.id, entity_id=user_id)
    await session.commit()
    return UserOut.from_user(user)


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: uuid.UUID,
    current_user=Depends(require_roles("SUPER_ADMIN", "FACILITY_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    user = await UserService(session).get_user(user_id)
    return UserOut.from_user(user)


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    current_user=Depends(require_roles("SUPER_ADMIN", "FACILITY_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = UserService(session)
    # Facility admins are restricted to users within their own active facility.
    acting_facility_id = (
        None if "SUPER_ADMIN" in current_user.effective_roles else current_user.active_facility_id
    )
    user = await svc.update_user(user_id, payload, acting_facility_id)
    await AuditService(session).log("UPDATE_USER", "user", user_id=current_user.id, entity_id=user_id)
    await session.commit()
    return UserOut.from_user(user)


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
