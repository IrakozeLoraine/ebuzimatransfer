import uuid
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_role, get_current_user
from app.services.facility_service import FacilityService
from app.services.audit_service import AuditService
from app.schemas.facility import FacilityCreate, FacilityUpdate, FacilityOut

router = APIRouter()


@router.get("", response_model=List[FacilityOut])
async def list_facilities(
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    return await FacilityService(session).list_all()


@router.post("", response_model=FacilityOut, status_code=201)
async def create_facility(
    payload: FacilityCreate,
    current_user=Depends(require_role("SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = FacilityService(session)
    f = await svc.create(payload)
    await AuditService(session).log("CREATE_FACILITY", "facility", user_id=current_user.id, entity_id=f.id)
    await session.commit()
    await session.refresh(f)
    return f


@router.get("/{facility_id}", response_model=FacilityOut)
async def get_facility(
    facility_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    return await FacilityService(session).get(facility_id)


@router.put("/{facility_id}", response_model=FacilityOut)
async def update_facility(
    facility_id: uuid.UUID,
    payload: FacilityUpdate,
    current_user=Depends(require_role("SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = FacilityService(session)
    f = await svc.update(facility_id, payload)
    await AuditService(session).log("UPDATE_FACILITY", "facility", user_id=current_user.id, entity_id=facility_id)
    await session.commit()
    return f


@router.delete("/{facility_id}")
async def delete_facility(
    facility_id: uuid.UUID,
    current_user=Depends(require_role("SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    await FacilityService(session).delete(facility_id)
    await AuditService(session).log("DELETE_FACILITY", "facility", user_id=current_user.id, entity_id=facility_id)
    await session.commit()
    return {"success": True}
