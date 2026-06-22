import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_roles, get_current_user
from app.core.exceptions import NotFoundError
from app.models.call import FacilityPhoneLine, CallLog
from app.models.user import User
from app.services.audit_service import AuditService
from app.schemas.call import PhoneLineCreate, PhoneLineUpdate, PhoneLineOut, CallLogCreate, CallLogOut

router = APIRouter()

SUPER_ADMIN = "SUPER_ADMIN"


# ------------------------------------------------------------------ phone lines

@router.get("/phone-lines", response_model=List[PhoneLineOut])
async def list_phone_lines(
    facility_id: uuid.UUID = Query(...),
    active_only: bool = Query(True),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(FacilityPhoneLine).where(FacilityPhoneLine.facility_id == facility_id)
    if active_only:
        stmt = stmt.where(FacilityPhoneLine.is_active.is_(True))
    stmt = stmt.order_by(FacilityPhoneLine.label)
    return list((await session.execute(stmt)).scalars().all())


@router.post("/phone-lines", response_model=PhoneLineOut, status_code=201)
async def create_phone_line(
    facility_id: uuid.UUID = Query(...),
    payload: PhoneLineCreate = ...,
    current_user=Depends(require_roles(SUPER_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    line = FacilityPhoneLine(facility_id=facility_id, **payload.model_dump())
    session.add(line)
    await session.flush()
    await AuditService(session).log("CREATE_PHONE_LINE", "facility_phone_line", user_id=current_user.id, entity_id=line.id)
    await session.commit()
    await session.refresh(line)
    return line


@router.put("/phone-lines/{line_id}", response_model=PhoneLineOut)
async def update_phone_line(
    line_id: uuid.UUID,
    payload: PhoneLineUpdate,
    current_user=Depends(require_roles(SUPER_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    line = await session.get(FacilityPhoneLine, line_id)
    if not line:
        raise NotFoundError("Phone line")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(line, field, value)
    await session.commit()
    await session.refresh(line)
    return line


@router.delete("/phone-lines/{line_id}")
async def delete_phone_line(
    line_id: uuid.UUID,
    current_user=Depends(require_roles(SUPER_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    line = await session.get(FacilityPhoneLine, line_id)
    if not line:
        raise NotFoundError("Phone line")
    await session.delete(line)
    await session.commit()
    return {"success": True}


# -------------------------------------------------------------------- call logs

def _call_out(row: CallLog) -> CallLogOut:
    return CallLogOut(
        id=row.id,
        referral_id=row.referral_id,
        to_facility_id=row.to_facility_id,
        to_number=row.to_number,
        from_line_id=row.from_line_id,
        purpose=row.purpose,
        notes=row.notes,
        placed_by=row.placed_by,
        placed_by_name=row.caller.full_name if row.caller else None,
        from_line_label=row.from_line.label if row.from_line else None,
        created_at=row.created_at,
    )


@router.post("/log", response_model=CallLogOut, status_code=201)
async def log_call(
    payload: CallLogCreate,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Record that the user placed a coordination call (from an institutional
    line) to confirm resource availability."""
    call = CallLog(placed_by=current_user.id, **payload.model_dump())
    session.add(call)
    await session.flush()
    await AuditService(session).log("LOG_CALL", "call_log", user_id=current_user.id, entity_id=call.id)
    await session.commit()
    # Reload with relationships for the response.
    from sqlalchemy.orm import selectinload
    result = await session.execute(
        select(CallLog).where(CallLog.id == call.id).options(selectinload(CallLog.caller), selectinload(CallLog.from_line))
    )
    return _call_out(result.scalar_one())


@router.get("/log", response_model=List[CallLogOut])
async def list_calls(
    referral_id: Optional[uuid.UUID] = Query(None),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    from sqlalchemy.orm import selectinload
    stmt = select(CallLog).options(selectinload(CallLog.caller), selectinload(CallLog.from_line))
    if referral_id is not None:
        stmt = stmt.where(CallLog.referral_id == referral_id)
    stmt = stmt.order_by(CallLog.created_at.desc()).limit(100)
    rows = (await session.execute(stmt)).scalars().all()
    return [_call_out(r) for r in rows]
