import uuid
from typing import List, Optional, Set
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_roles, get_current_user
from app.core.exceptions import NotFoundError, ValidationError, ForbiddenError
from app.core.security import hash_password, generate_password
from app.models.ambulance import Ambulance
from app.models.transport import TransportEvent
from app.services.audit_service import AuditService
from app.schemas.ambulance import (
    AmbulanceCreate,
    AmbulanceUpdate,
    AmbulanceOut,
    AmbulanceCredentials,
)

router = APIRouter()

SUPER_ADMIN = "SUPER_ADMIN"
FACILITY_ADMIN = "FACILITY_ADMIN"


def _is_super(user) -> bool:
    return SUPER_ADMIN in set(user.effective_roles)


def _visible_facility(user) -> uuid.UUID | None:
    return getattr(user, "active_facility_id", None) or (
        user.facilities[0].id if len(user.facilities) == 1 else None
    )


async def _busy_ambulance_ids(session: AsyncSession, ids: List[uuid.UUID]) -> Set[uuid.UUID]:
    """Of the given ambulances, those currently on an in-progress journey
    (assigned to a transfer that has not yet arrived)."""
    if not ids:
        return set()
    rows = await session.execute(
        select(TransportEvent.ambulance_id).where(
            TransportEvent.ambulance_id.in_(ids),
            TransportEvent.arrival_time.is_(None),
        )
    )
    return {r[0] for r in rows if r[0] is not None}


def _to_out(amb: Ambulance, busy: bool) -> AmbulanceOut:
    return AmbulanceOut(
        id=amb.id,
        facility_id=amb.facility_id,
        facility_name=amb.facility.name if amb.facility else None,
        plate_number=amb.plate_number,
        driver_name=amb.driver_name,
        driver_phone=amb.driver_phone,
        login_id=amb.login_id,
        is_active=amb.is_active,
        status="ON_JOURNEY" if busy else "AVAILABLE",
        created_at=amb.created_at,
    )


def _with_password(out: AmbulanceOut, password: str) -> AmbulanceCredentials:
    """Wrap an ambulance with its one-time plaintext password for the setup reveal."""
    return AmbulanceCredentials(**out.model_dump(), password=password)


@router.get("", response_model=List[AmbulanceOut])
async def list_ambulances(
    available: bool = Query(False, description="Only active ambulances not on a journey"),
    current_user=Depends(require_roles("CLINICIAN", FACILITY_ADMIN, SUPER_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    """A facility's ambulances. Super admins see all. With ``available=true`` (used
    when arranging transport) only free, active ambulances are returned."""
    stmt = (
        select(Ambulance)
        .options(selectinload(Ambulance.facility))
        .order_by(Ambulance.plate_number)
    )
    if not _is_super(current_user):
        stmt = stmt.where(Ambulance.facility_id == _visible_facility(current_user))
    ambulances = list((await session.execute(stmt)).scalars())
    busy = await _busy_ambulance_ids(session, [a.id for a in ambulances])
    out = [_to_out(a, a.id in busy) for a in ambulances]
    if available:
        out = [o for o in out if o.is_active and o.status == "AVAILABLE"]
    return out


@router.post("", response_model=AmbulanceCredentials, status_code=201)
async def create_ambulance(
    payload: AmbulanceCreate,
    current_user=Depends(require_roles(FACILITY_ADMIN, SUPER_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    """Register an ambulance and its driver login. A super admin must say which
    facility owns it; a facility admin's ambulances belong to their own facility.

    The server generates the driver password and returns it once, alongside the
    login ID, so the admin can set up the phone (or hand over the setup QR code).
    It is never returned again — use the reset endpoint to issue a new one."""
    facility_id = payload.facility_id if _is_super(current_user) else _visible_facility(current_user)
    if facility_id is None:
        raise ValidationError("A facility is required to register an ambulance")

    # The plate number doubles as the driver's login ID — one less thing to set.
    plate_number = payload.plate_number.strip()
    if not plate_number:
        raise ValidationError("A plate number is required")
    exists = await session.scalar(select(Ambulance).where(Ambulance.login_id == plate_number))
    if exists:
        raise ValidationError("An ambulance with that plate number is already registered")

    password = generate_password()
    amb = Ambulance(
        facility_id=facility_id,
        plate_number=plate_number,
        driver_name=payload.driver_name,
        driver_phone=payload.driver_phone,
        login_id=plate_number,
        password_hash=hash_password(password),
    )
    session.add(amb)
    await AuditService(session).log("CREATE_AMBULANCE", "ambulance", user_id=current_user.id)
    await session.commit()
    result = await session.execute(
        select(Ambulance).where(Ambulance.id == amb.id).options(selectinload(Ambulance.facility))
    )
    return _with_password(_to_out(result.scalar_one(), busy=False), password)


@router.patch("/{ambulance_id}", response_model=AmbulanceOut)
async def update_ambulance(
    ambulance_id: uuid.UUID,
    payload: AmbulanceUpdate,
    current_user=Depends(require_roles(FACILITY_ADMIN, SUPER_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    """Edit an ambulance's plate/driver details or activate/deactivate it. Facility
    admins may only touch their own facility's. Password resets go through the
    dedicated reset endpoint."""
    result = await session.execute(
        select(Ambulance).where(Ambulance.id == ambulance_id).options(selectinload(Ambulance.facility))
    )
    amb = result.scalar_one_or_none()
    if not amb:
        raise NotFoundError("Ambulance")
    if not _is_super(current_user) and amb.facility_id != _visible_facility(current_user):
        raise ForbiddenError()

    if payload.plate_number is not None:
        new_plate = payload.plate_number.strip()
        if new_plate != amb.plate_number:
            clash = await session.scalar(
                select(Ambulance).where(
                    Ambulance.login_id == new_plate, Ambulance.id != amb.id
                )
            )
            if clash:
                raise ValidationError("An ambulance with that plate number is already registered")
        # The login ID tracks the plate number, so update both together.
        amb.plate_number = new_plate
        amb.login_id = new_plate
    if payload.driver_name is not None:
        amb.driver_name = payload.driver_name
    if payload.driver_phone is not None:
        amb.driver_phone = payload.driver_phone
    if payload.is_active is not None:
        amb.is_active = payload.is_active

    await AuditService(session).log(
        "UPDATE_AMBULANCE", "ambulance", user_id=current_user.id, entity_id=ambulance_id
    )
    await session.commit()
    busy = (await _busy_ambulance_ids(session, [amb.id])) and True
    await session.refresh(amb)
    return _to_out(amb, busy=bool(busy))


@router.post("/{ambulance_id}/reset-password", response_model=AmbulanceCredentials)
async def reset_ambulance_password(
    ambulance_id: uuid.UUID,
    current_user=Depends(require_roles(FACILITY_ADMIN, SUPER_ADMIN)),
    session: AsyncSession = Depends(get_session),
):
    """Issue a fresh driver password and reveal it once. Any phone still signed in
    with the old credentials keeps its token until it signs out — re-running setup
    with the new QR code re-pairs the phone."""
    result = await session.execute(
        select(Ambulance).where(Ambulance.id == ambulance_id).options(selectinload(Ambulance.facility))
    )
    amb = result.scalar_one_or_none()
    if not amb:
        raise NotFoundError("Ambulance")
    if not _is_super(current_user) and amb.facility_id != _visible_facility(current_user):
        raise ForbiddenError()

    password = generate_password()
    amb.password_hash = hash_password(password)
    await AuditService(session).log(
        "RESET_AMBULANCE_PASSWORD", "ambulance", user_id=current_user.id, entity_id=ambulance_id
    )
    await session.commit()
    busy = (await _busy_ambulance_ids(session, [amb.id])) and True
    await session.refresh(amb)
    return _with_password(_to_out(amb, busy=bool(busy)), password)
