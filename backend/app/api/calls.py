import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_roles, get_current_user
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.spreadsheet import read_csv_rows, read_xlsx_rows
from app.models.call import FacilityPhoneLine, CallLog, PhoneLineType
from app.models.facility import Facility
from app.models.user import User
from app.services.audit_service import AuditService
from app.schemas.call import (
    PhoneLineCreate,
    PhoneLineUpdate,
    PhoneLineOut,
    PhoneLineImportError,
    PhoneLineImportResult,
    CallLogCreate,
    CallLogOut,
)

router = APIRouter()

SUPER_ADMIN = "SUPER_ADMIN"
FACILITY_ADMIN = "FACILITY_ADMIN"


def _is_super_admin(user) -> bool:
    return SUPER_ADMIN in set(user.effective_roles)


def _resolve_managed_facility(user, requested: Optional[uuid.UUID]) -> uuid.UUID:
    """The facility a phone-line manager may act on. Super admins act on any
    facility they name; facility admins are pinned to their own active/single
    facility and may not target another."""
    if _is_super_admin(user):
        if requested is None:
            raise ValidationError("facility_id is required")
        return requested
    facility_ids = {f.id for f in user.facilities}
    target = requested or getattr(user, "active_facility_id", None)
    if target is None and len(facility_ids) == 1:
        target = next(iter(facility_ids))
    if target is None or target not in facility_ids:
        raise ForbiddenError()
    return target


async def _assert_can_manage_line(user, line: FacilityPhoneLine) -> None:
    """A facility admin may only touch lines belonging to their own facility."""
    if _is_super_admin(user):
        return
    if line.facility_id not in {f.id for f in user.facilities}:
        raise ForbiddenError()


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
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    facility_id = _resolve_managed_facility(current_user, facility_id)
    facility = await session.get(Facility, facility_id)
    if not facility:
        raise NotFoundError("Facility")
    if not facility.is_active:
        raise ValidationError(
            "Cannot add phone lines to a deactivated facility. Reactivate it first."
        )
    line = FacilityPhoneLine(facility_id=facility_id, **payload.model_dump())
    session.add(line)
    await session.flush()
    await AuditService(session).log("CREATE_PHONE_LINE", "facility_phone_line", user_id=current_user.id, entity_id=line.id)
    await session.commit()
    await session.refresh(line)
    return line


@router.post("/phone-lines/import", response_model=PhoneLineImportResult)
async def import_phone_lines(
    facility_id: uuid.UUID = Query(...),
    file: UploadFile = File(...),
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    """Bulk-create phone lines for a facility from a .csv or .xlsx file.

    Expected header row (case-insensitive): ``label``, ``phone_number`` and an
    optional ``line_type``. Rows with an unknown type or a missing label/number
    are reported as errors while the remaining valid rows still import.
    """
    facility_id = _resolve_managed_facility(current_user, facility_id)
    facility = await session.get(Facility, facility_id)
    if not facility:
        raise NotFoundError("Facility")
    if not facility.is_active:
        raise ValidationError(
            "Cannot add phone lines to a deactivated facility. Reactivate it first."
        )

    contents = await file.read()
    filename = (file.filename or "").lower()
    is_csv = filename.endswith(".csv") or file.content_type == "text/csv"
    rows = read_csv_rows(contents) if is_csv else read_xlsx_rows(contents)
    if not rows:
        return PhoneLineImportResult(created=0, errors=[])

    header = [str(c).strip().lower() if c is not None else "" for c in rows[0]]

    def col(*names: str) -> Optional[int]:
        for name in names:
            if name in header:
                return header.index(name)
        return None

    idx_label = col("label", "name")
    idx_number = col("phone_number", "phone", "number")
    idx_type = col("line_type", "type")
    if idx_label is None or idx_number is None:
        raise ValidationError("Missing required 'label' and 'phone_number' columns in the spreadsheet.")

    types_by_value = {t.value.lower(): t for t in PhoneLineType}
    errors: List[PhoneLineImportError] = []
    created = 0
    for i, raw in enumerate(rows[1:], start=2):  # row 1 is the header
        def cell(idx: Optional[int]) -> Optional[str]:
            if idx is None or idx >= len(raw) or raw[idx] is None:
                return None
            return str(raw[idx]).strip()

        label = cell(idx_label)
        number = cell(idx_number)
        if not label and not number:
            continue  # skip blank rows silently
        if not label or not number:
            errors.append(PhoneLineImportError(row=i, message="Both label and phone_number are required"))
            continue

        line_type = PhoneLineType.COORDINATION
        type_val = cell(idx_type)
        if type_val:
            resolved = types_by_value.get(type_val.lower())
            if resolved is None:
                errors.append(PhoneLineImportError(row=i, message=f"Unknown line_type '{type_val}'"))
                continue
            line_type = resolved

        session.add(
            FacilityPhoneLine(
                facility_id=facility_id,
                label=label,
                phone_number=number,
                line_type=line_type,
            )
        )
        created += 1

    await session.flush()
    await AuditService(session).log(
        "IMPORT_PHONE_LINES", "facility_phone_line", user_id=current_user.id, extra={"created": created}
    )
    await session.commit()
    return PhoneLineImportResult(created=created, errors=errors)


@router.put("/phone-lines/{line_id}", response_model=PhoneLineOut)
async def update_phone_line(
    line_id: uuid.UUID,
    payload: PhoneLineUpdate,
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    line = await session.get(FacilityPhoneLine, line_id)
    if not line:
        raise NotFoundError("Phone line")
    await _assert_can_manage_line(current_user, line)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(line, field, value)
    await session.commit()
    await session.refresh(line)
    return line


@router.delete("/phone-lines/{line_id}")
async def delete_phone_line(
    line_id: uuid.UUID,
    current_user=Depends(require_roles(SUPER_ADMIN, FACILITY_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    line = await session.get(FacilityPhoneLine, line_id)
    if not line:
        raise NotFoundError("Phone line")
    await _assert_can_manage_line(current_user, line)
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
