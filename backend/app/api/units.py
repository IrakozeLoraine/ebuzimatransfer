import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_role, get_current_user
from app.services.unit_service import UnitService
from app.services.audit_service import AuditService
from app.schemas.unit import UnitCreate, UnitImportResult, UnitUpdate, UnitOut

router = APIRouter()

SUPER_ADMIN = "SUPER_ADMIN"


@router.get("", response_model=List[UnitOut])
async def list_units(
    facility_id: Optional[uuid.UUID] = Query(None),
    active: bool = Query(True),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """List catalog units. ``facility_id`` narrows to that facility's
    tier-eligible units (cascading)."""
    return await UnitService(session).list(facility_id=facility_id, active_only=active)


@router.post("", response_model=UnitOut, status_code=201)
async def create_unit(
    payload: UnitCreate,
    current_user=Depends(require_role(SUPER_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    svc = UnitService(session)
    unit = await svc.create(payload)
    await AuditService(session).log("CREATE_UNIT", "unit", user_id=current_user.id, entity_id=unit.id)
    await session.commit()
    await session.refresh(unit)
    return unit


@router.post("/import", response_model=UnitImportResult)
async def import_units(
    file: UploadFile = File(...),
    current_user=Depends(require_role(SUPER_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    """Bulk-create catalog units from a .csv or .xlsx file (super admin only)."""
    contents = await file.read()
    filename = (file.filename or "").lower()
    is_csv = filename.endswith(".csv") or file.content_type == "text/csv"
    result = await UnitService(session).import_from_file(contents, is_csv=is_csv)
    await AuditService(session).log(
        "IMPORT_UNITS", "unit", user_id=current_user.id, extra={"created": result.created}
    )
    await session.commit()
    return result


@router.put("/{unit_id}", response_model=UnitOut)
async def update_unit(
    unit_id: uuid.UUID,
    payload: UnitUpdate,
    current_user=Depends(require_role(SUPER_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    svc = UnitService(session)
    unit = await svc.update(unit_id, payload)
    await AuditService(session).log("UPDATE_UNIT", "unit", user_id=current_user.id, entity_id=unit_id)
    await session.commit()
    await session.refresh(unit)
    return unit


@router.delete("/{unit_id}")
async def delete_unit(
    unit_id: uuid.UUID,
    current_user=Depends(require_role(SUPER_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    svc = UnitService(session)
    await svc.delete(unit_id)
    await AuditService(session).log("DELETE_UNIT", "unit", user_id=current_user.id, entity_id=unit_id)
    await session.commit()
    return {"success": True}
