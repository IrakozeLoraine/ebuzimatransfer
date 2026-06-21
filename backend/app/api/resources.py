import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, File, UploadFile, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_role, require_roles, get_current_user
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models.unit import Unit
from app.models.resource import ResourceStatus
from app.services.resource_service import ResourceService
from app.services.audit_service import AuditService
from app.websocket.manager import ws_manager
from app.schemas.resource import (
    ResourceCreate,
    ResourceStatusUpdate,
    ResourceAssign,
    ResourceOut,
    ResourceUsageOut,
    ResourceImportResult,
)

router = APIRouter()

SUPER_ADMIN = "SUPER_ADMIN"
FACILITY_ADMIN = "FACILITY_ADMIN"


def _is_super_admin(user) -> bool:
    return SUPER_ADMIN in set(user.effective_roles)


async def _assert_unit_in_user_facilities(session: AsyncSession, user, unit_id: uuid.UUID) -> Unit:
    result = await session.execute(select(Unit).where(Unit.id == unit_id))
    unit = result.scalar_one_or_none()
    if not unit:
        raise NotFoundError("Unit")
    if unit.facility_id not in {f.id for f in user.facilities}:
        raise ForbiddenError()
    return unit


@router.get("", response_model=List[ResourceOut])
async def list_resources(
    unassigned: bool = Query(False),
    facility_id: Optional[uuid.UUID] = Query(None),
    status: Optional[ResourceStatus] = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    svc = ResourceService(session)
    if _is_super_admin(current_user):
        return await svc.list_scoped(facility_id=facility_id, unassigned=unassigned, status=status)
    # Non-super-admins only ever see resources in their own facilities.
    facility_ids = [f.id for f in current_user.facilities]
    if facility_id is not None and facility_id not in facility_ids:
        raise ForbiddenError()
    return await svc.list_scoped(
        facility_ids=facility_ids,
        facility_id=facility_id,
        status=status,
    )


@router.post("", response_model=ResourceOut, status_code=201)
async def create_resource(
    payload: ResourceCreate,
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    if not _is_super_admin(current_user):
        # FACILITY_ADMIN must target a unit in their own facility; they cannot
        # create unassigned central stock.
        if not payload.unit_id:
            raise ValidationError("A unit must be selected")
        await _assert_unit_in_user_facilities(session, current_user, payload.unit_id)

    svc = ResourceService(session)
    resource = await svc.create(payload)
    await AuditService(session).log("CREATE_RESOURCE", "resource", user_id=current_user.id, entity_id=resource.id)
    await session.commit()
    await session.refresh(resource)
    return ResourceOut.model_validate(resource)


@router.post("/import", response_model=ResourceImportResult)
async def import_resources(
    file: UploadFile = File(...),
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    default_facility_id = None
    if not _is_super_admin(current_user):
        # Facility admins import into their (active) facility; require exactly one
        # facility context so the target is unambiguous.
        facility_ids = [f.id for f in current_user.facilities]
        default_facility_id = getattr(current_user, "active_facility_id", None) or (
            facility_ids[0] if len(facility_ids) == 1 else None
        )
        if default_facility_id is None:
            raise ValidationError("Could not determine a target facility for the import")

    contents = await file.read()
    filename = (file.filename or "").lower()
    is_csv = filename.endswith(".csv") or file.content_type == "text/csv"
    svc = ResourceService(session)
    result = await svc.import_from_excel(
        contents, default_facility_id=default_facility_id, is_csv=is_csv
    )
    await AuditService(session).log(
        "IMPORT_RESOURCES", "resource", user_id=current_user.id, extra={"created": result.created}
    )
    await session.commit()
    return result


@router.get("/{resource_id}", response_model=ResourceOut)
async def get_resource(
    resource_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    resource = await ResourceService(session).get(resource_id)
    return ResourceOut.model_validate(resource)


@router.get("/{resource_id}/usage", response_model=ResourceUsageOut)
async def get_resource_usage(
    resource_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    return await ResourceService(session).usage(resource_id)


@router.post("/{resource_id}/assign", response_model=ResourceOut)
async def assign_resource(
    resource_id: uuid.UUID,
    payload: ResourceAssign,
    current_user=Depends(require_role(SUPER_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    svc = ResourceService(session)
    resource = await svc.assign(resource_id, payload.facility_id, payload.unit_id)
    await AuditService(session).log(
        "ASSIGN_RESOURCE",
        "resource",
        user_id=current_user.id,
        entity_id=resource_id,
        extra={"facility_id": str(payload.facility_id) if payload.facility_id else None},
    )
    await session.commit()
    await ws_manager.broadcast_to_channel(
        "capacity", {"event": "RESOURCE_ASSIGNED", "resource_id": str(resource_id)}
    )
    return resource


@router.patch("/{resource_id}/status", response_model=ResourceOut)
async def update_resource_status(
    resource_id: uuid.UUID,
    payload: ResourceStatusUpdate,
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN, "ICU_COORDINATOR")),
    session: AsyncSession = Depends(get_session),
):
    svc = ResourceService(session)
    resource = await svc.get(resource_id)
    # Facility-scoped roles may only update resources in their own facilities.
    if not _is_super_admin(current_user):
        if resource.facility_id not in {f.id for f in current_user.facilities}:
            raise ForbiddenError()
    resource = await svc.update_status(resource_id, payload)
    await AuditService(session).log("UPDATE_RESOURCE_STATUS", "resource", user_id=current_user.id, entity_id=resource_id, extra={"status": payload.status.value})
    await session.commit()
    await ws_manager.broadcast_to_channel("capacity", {"event": "RESOURCE_UPDATED", "resource_id": str(resource_id), "status": payload.status.value})
    return ResourceOut.model_validate(resource)
