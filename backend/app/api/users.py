import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_roles, get_current_user
from app.core.exceptions import ForbiddenError, ValidationError
from app.services.user_service import UserService
from app.services.audit_service import AuditService
from app.schemas.user import (
    UserCreate,
    UserCreateAssign,
    UserUpdate,
    UserOut,
    UserStatusUpdate,
    UserAssignRequest,
    UserImportResult,
)

router = APIRouter()


def _resolve_import_facility(current_user, requested: Optional[uuid.UUID]) -> uuid.UUID:
    """The facility a bulk user-import targets: super admins must name one,
    facility admins use their own active/single facility."""
    if "SUPER_ADMIN" in current_user.effective_roles:
        if requested is None:
            raise ValidationError("facility_id is required")
        return requested
    facility_ids = {f.id for f in current_user.facilities}
    target = requested or getattr(current_user, "active_facility_id", None)
    if target is None and len(facility_ids) == 1:
        target = next(iter(facility_ids))
    if target is None or target not in facility_ids:
        raise ForbiddenError()
    return target


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


@router.post("/import", response_model=UserImportResult)
async def import_users(
    facility_id: Optional[uuid.UUID] = Query(None),
    file: UploadFile = File(...),
    current_user=Depends(require_roles("SUPER_ADMIN", "FACILITY_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """Bulk register/assign users at a facility from a .csv or .xlsx file.

    Super admins must provide ``facility_id``; facility admins import into their
    own facility.
    """
    target = _resolve_import_facility(current_user, facility_id)
    contents = await file.read()
    filename = (file.filename or "").lower()
    is_csv = filename.endswith(".csv") or file.content_type == "text/csv"
    result = await UserService(session).import_users(contents, target, is_csv=is_csv)
    await AuditService(session).log(
        "IMPORT_USERS",
        "user",
        user_id=current_user.id,
        extra={"created": result.created, "assigned": result.assigned},
    )
    await session.commit()
    return result


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

    # A facility admin can't grant roles to their own account.
    if payload.medical_id.strip().lower() == (current_user.medical_id or "").lower():
        from app.core.exceptions import ForbiddenError
        raise ForbiddenError("You can't assign roles to your own account.")

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
