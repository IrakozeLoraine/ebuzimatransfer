import uuid
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_role, require_roles, get_current_user
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.unit import Unit
from app.services.resource_service import ResourceService
from app.services.audit_service import AuditService
from app.websocket.manager import ws_manager
from app.schemas.resource import ResourceCreate, ResourceUpdate, ResourceStatusUpdate, ResourceOut, CapacityRow

router = APIRouter()


@router.get("", response_model=List[ResourceOut])
async def list_resources(
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    return await ResourceService(session).list_all()


@router.post("", response_model=ResourceOut, status_code=201)
async def create_resource(
    payload: ResourceCreate,
    current_user=Depends(require_roles("SUPER_ADMIN", "FACILITY_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    user_roles = {r.name for r in current_user.roles}
    if "SUPER_ADMIN" not in user_roles:
        # FACILITY_ADMIN may only create resources for units in their own facilities
        result = await session.execute(select(Unit).where(Unit.id == payload.unit_id))
        unit = result.scalar_one_or_none()
        if not unit:
            raise NotFoundError("Unit")
        user_facility_ids = {f.id for f in current_user.facilities}
        if unit.facility_id not in user_facility_ids:
            raise ForbiddenError()

    svc = ResourceService(session)
    resource = await svc.create(payload)
    await AuditService(session).log("CREATE_RESOURCE", "resource", user_id=current_user.id, entity_id=resource.id)
    await session.commit()
    await session.refresh(resource)
    return resource


@router.get("/{resource_id}", response_model=ResourceOut)
async def get_resource(
    resource_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    return await ResourceService(session).get(resource_id)


@router.patch("/{resource_id}/status", response_model=ResourceOut)
async def update_resource_status(
    resource_id: uuid.UUID,
    payload: ResourceStatusUpdate,
    current_user=Depends(require_role("ICU_COORDINATOR")),
    session: AsyncSession = Depends(get_session),
):
    svc = ResourceService(session)
    resource = await svc.update_status(resource_id, payload)
    await AuditService(session).log("UPDATE_RESOURCE_STATUS", "resource", user_id=current_user.id, entity_id=resource_id, extra={"status": payload.status.value})
    await session.commit()
    await ws_manager.broadcast_to_channel("capacity", {"event": "RESOURCE_UPDATED", "resource_id": str(resource_id), "status": payload.status.value})
    return resource
