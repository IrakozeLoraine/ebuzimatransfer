import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, File, UploadFile, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_roles, get_current_user
from app.core.exceptions import ForbiddenError, ValidationError
from app.models.resource import ResourceStatus
from app.services.resource_service import ResourceService
from app.services.audit_service import AuditService
from app.websocket.manager import ws_manager
from app.schemas.resource import (
    ResourceCreate,
    ResourceCountsUpdate,
    ResourceBulkAssign,
    ResourceUnitCount,
    ResourceOut,
    ResourceUsageOut,
    ResourceImportResult,
    ResourceReserveRequest,
)

router = APIRouter()

SUPER_ADMIN = "SUPER_ADMIN"
FACILITY_ADMIN = "FACILITY_ADMIN"


def _is_super_admin(user) -> bool:
    return SUPER_ADMIN in set(user.effective_roles)


def _resolve_target_facility(user, requested: Optional[uuid.UUID]) -> uuid.UUID:
    """The facility a non-super-admin may act on: the requested one (must be
    theirs) or their single/active facility."""
    facility_ids = {f.id for f in user.facilities}
    target = requested or getattr(user, "active_facility_id", None)
    if target is None and len(facility_ids) == 1:
        target = next(iter(facility_ids))
    if target is None or target not in facility_ids:
        raise ForbiddenError()
    return target


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
        # FACILITY_ADMIN creates resources within their own facility; they cannot
        # create unassigned central stock. The service validates that the chosen
        # unit is available at that facility's tier.
        if not payload.unit_id:
            raise ValidationError("A unit must be selected")
        payload.facility_id = _resolve_target_facility(current_user, payload.facility_id)

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


@router.get("/available", response_model=List[ResourceOut])
async def available_resources(
    unit_id: Optional[uuid.UUID] = Query(None),
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN, "CLINICIAN")),
    session: AsyncSession = Depends(get_session),
):
    """Available resources across all facilities, for initiating inter-facility
    transfer requests. Optionally filtered by clinical unit."""
    return await ResourceService(session).list_available(unit_id=unit_id)


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


@router.post("/assign", response_model=List[ResourceOut])
async def assign_resources(
    payload: ResourceBulkAssign,
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    """Assign/transfer one or more resources in a single action. Super admins can move
    resources to any facility (or back to central stock); facility admins may only
    re-assign the clinical unit of resources already in their own facility — the
    facility itself is never changed for them."""
    if not payload.resource_ids:
        raise ValidationError("No resources selected")

    svc = ResourceService(session)
    is_super = _is_super_admin(current_user)
    facility_ids = {f.id for f in current_user.facilities}

    results = []
    for resource_id in payload.resource_ids:
        if is_super:
            target_facility = payload.facility_id
            target_unit = payload.unit_id
        else:
            # Facility admins may only re-unit resources already in their facility.
            resource = await svc.get(resource_id)
            if resource.facility_id not in facility_ids:
                raise ForbiddenError()
            target_facility = resource.facility_id
            target_unit = payload.unit_id

        result = await svc.assign(resource_id, target_facility, target_unit, payload.quantity)
        if result is None:
            # Nothing movable on this resource (e.g. all units occupied) — skip it.
            continue
        await AuditService(session).log(
            "ASSIGN_RESOURCE",
            "resource",
            user_id=current_user.id,
            entity_id=resource_id,
            extra={
                "facility_id": str(target_facility) if target_facility else None,
                "quantity": payload.quantity,
            },
        )
        results.append(result)

    await session.commit()
    for result in results:
        await ws_manager.broadcast_to_channel(
            "capacity", {"event": "RESOURCE_ASSIGNED", "resource_id": str(result.id)}
        )
    return results


async def _authorize_resource_admin(svc: ResourceService, resource_id: uuid.UUID, current_user):
    """Resolve a resource and ensure the caller may manage its quantity: super
    admins anywhere, facility admins only within their own facilities."""
    resource = await svc.get(resource_id)
    if not _is_super_admin(current_user):
        if resource.facility_id not in {f.id for f in current_user.facilities}:
            raise ForbiddenError()
    return resource


@router.post("/{resource_id}/add-units", response_model=ResourceOut)
async def add_resource_units(
    resource_id: uuid.UUID,
    payload: ResourceUnitCount,
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    """Increase a resource group's quantity. Super admins can grow any group
    (including central stock); facility admins only groups in their own facility."""
    svc = ResourceService(session)
    await _authorize_resource_admin(svc, resource_id, current_user)
    result = await svc.add_units(resource_id, payload.count)
    await AuditService(session).log(
        "ADD_RESOURCE_UNITS",
        "resource",
        user_id=current_user.id,
        entity_id=resource_id,
        extra={"count": payload.count},
    )
    await session.commit()
    await ws_manager.broadcast_to_channel(
        "capacity", {"event": "RESOURCE_UPDATED", "resource_id": str(resource_id)}
    )
    return result


@router.post("/{resource_id}/remove-units", response_model=ResourceOut)
async def remove_resource_units(
    resource_id: uuid.UUID,
    payload: ResourceUnitCount,
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    """Decrease a resource group's quantity by retiring out-of-service units.
    Super admins can shrink any group; facility admins only groups in their own
    facility."""
    svc = ResourceService(session)
    await _authorize_resource_admin(svc, resource_id, current_user)
    result = await svc.remove_units(resource_id, payload.count)
    await AuditService(session).log(
        "REMOVE_RESOURCE_UNITS",
        "resource",
        user_id=current_user.id,
        entity_id=resource_id,
        extra={"count": payload.count},
    )
    await session.commit()
    await ws_manager.broadcast_to_channel(
        "capacity", {"event": "RESOURCE_UPDATED", "resource_id": str(resource_id)}
    )
    return result


@router.post("/{resource_id}/reserve", response_model=ResourceOut)
async def reserve_resource(
    resource_id: uuid.UUID,
    payload: ResourceReserveRequest,
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN, "CLINICIAN")),
    session: AsyncSession = Depends(get_session),
):
    """Initiate a transfer request by reserving an available resource (typically
    at another facility) for the requester's patient."""
    svc = ResourceService(session)
    await svc.reserve(
        resource_id,
        reserved_by=current_user.id,
        planned_admission_time=payload.planned_admission_time,
    )
    await AuditService(session).log(
        "RESERVE_RESOURCE", "resource", user_id=current_user.id, entity_id=resource_id
    )
    await session.commit()
    await ws_manager.broadcast_to_channel(
        "capacity", {"event": "RESOURCE_RESERVED", "resource_id": str(resource_id)}
    )
    resource = await svc.get(resource_id)
    return ResourceOut.model_validate(resource)


@router.patch("/{resource_id}/counts", response_model=ResourceOut)
async def update_resource_counts(
    resource_id: uuid.UUID,
    payload: ResourceCountsUpdate,
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN, "CLINICIAN")),
    session: AsyncSession = Depends(get_session),
):
    svc = ResourceService(session)
    resource = await svc.get(resource_id)
    # Facility-scoped roles may only update resources in their own facilities.
    if not _is_super_admin(current_user):
        if resource.facility_id not in {f.id for f in current_user.facilities}:
            raise ForbiddenError()
    resource = await svc.update_counts(resource_id, payload)
    await AuditService(session).log(
        "UPDATE_RESOURCE_COUNTS",
        "resource",
        user_id=current_user.id,
        entity_id=resource_id,
        extra={
            "occupied": payload.occupied,
            "reserved": payload.reserved,
            "out_of_service": payload.out_of_service,
        },
    )
    await session.commit()
    await ws_manager.broadcast_to_channel(
        "capacity", {"event": "RESOURCE_UPDATED", "resource_id": str(resource_id)}
    )
    return ResourceOut.model_validate(resource)
