import uuid
from datetime import datetime, timezone

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.core.permissions import get_current_user
from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError
from app.models.incall import InAppCall, InAppCallStatus
from app.models.user import User, UserFacilityRole, UserFacilityUnit
from app.models.ambulance import Ambulance
from app.services.user_service import UserService
from app.websocket.manager import ws_manager
from app.schemas.incall import InAppCallCreate, AmbulanceCallCreate, InAppCallOut, CallSignalIn

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _caller_facility(call: InAppCall):
    """The facility the call was placed from (the caller's facility membership)."""
    if not call.caller:
        return None
    facilities = call.caller.facilities
    return facilities[0] if facilities else None


def _caller_label(call: InAppCall) -> Optional[str]:
    """Display name of the caller, whether a clinician or an ambulance."""
    if call.caller_ambulance:
        amb = call.caller_ambulance
        return f"Ambulance {amb.plate_number}" + (f" ({amb.driver_name})" if amb.driver_name else "")
    return call.caller.full_name if call.caller else None


def _out(call: InAppCall) -> InAppCallOut:
    caller_facility = _caller_facility(call)
    caller_amb_facility_id = call.caller_ambulance.facility_id if call.caller_ambulance else None
    return InAppCallOut(
        id=call.id,
        caller_id=call.caller_id,
        caller_name=_caller_label(call),
        caller_facility_id=(caller_facility.id if caller_facility else None) or caller_amb_facility_id,
        caller_facility_name=caller_facility.name if caller_facility else None,
        caller_ambulance_id=call.caller_ambulance_id,
        callee_facility_id=call.callee_facility_id,
        callee_facility_name=call.callee_facility.name if call.callee_facility else None,
        callee_unit_id=call.callee_unit_id,
        callee_unit_name=call.callee_unit.name if call.callee_unit else None,
        callee_id=call.callee_id,
        callee_name=(
            f"Ambulance {call.callee_ambulance.plate_number}" if call.callee_ambulance
            else (call.callee.full_name if call.callee else None)
        ),
        callee_ambulance_id=call.callee_ambulance_id,
        referral_id=call.referral_id,
        status=call.status,
        started_at=call.started_at,
        ended_at=call.ended_at,
        created_at=call.created_at,
    )


async def _load(session: AsyncSession, call_id: uuid.UUID) -> InAppCall:
    call = await session.scalar(
        select(InAppCall)
        .where(InAppCall.id == call_id)
        .options(
            selectinload(InAppCall.caller).selectinload(User.facility_roles),
            selectinload(InAppCall.callee),
            selectinload(InAppCall.callee_facility),
            selectinload(InAppCall.callee_unit),
            selectinload(InAppCall.caller_ambulance),
            selectinload(InAppCall.callee_ambulance),
        )
    )
    if not call:
        raise NotFoundError("Call")
    return call


async def _notify(user_id: uuid.UUID, payload: dict) -> None:
    await ws_manager.broadcast_to_user(str(user_id), payload)


# The driver app subscribes to this per-ambulance channel for call events. It is
# distinct from the ``ambulance:{referral_id}`` GPS-tracking channel the web watches.
def ambulance_call_channel(ambulance_id: uuid.UUID) -> str:
    return f"ambulance-call:{ambulance_id}"


def _caller_channel(call: InAppCall) -> Optional[str]:
    """WS channel of the calling party (clinician user or ambulance app)."""
    if call.caller_ambulance_id:
        return ambulance_call_channel(call.caller_ambulance_id)
    return f"user:{call.caller_id}" if call.caller_id else None


def _callee_channel(call: InAppCall) -> Optional[str]:
    """WS channel of the answering party once known (clinician user or ambulance app)."""
    if call.callee_ambulance_id:
        return ambulance_call_channel(call.callee_ambulance_id)
    return f"user:{call.callee_id}" if call.callee_id else None


async def _notify_channel(channel: Optional[str], payload: dict) -> None:
    if channel:
        await ws_manager.broadcast_to_channel(channel, payload)


async def _facility_recipients(session: AsyncSession, facility_id: uuid.UUID, exclude_user_id: uuid.UUID) -> List[uuid.UUID]:
    """Everyone associated with the facility — they all see the incoming desk call;
    whoever is logged in can pick up. Excludes the caller."""
    users = await UserService(session).list_users_for_facility(facility_id)
    return [u.id for u in users if u.id != exclude_user_id]


async def _unit_recipients(
    session: AsyncSession,
    facility_id: uuid.UUID,
    unit_id: Optional[uuid.UUID],
    exclude_user_id: uuid.UUID,
) -> List[uuid.UUID]:
    """The clinicians who work in the given unit at the facility — only they are rung.
    With no unit, fall back to the whole-facility desk. Excludes the caller."""
    if unit_id is None:
        return await _facility_recipients(session, facility_id, exclude_user_id)
    rows = await session.execute(
        select(UserFacilityUnit.user_id).where(
            UserFacilityUnit.facility_id == facility_id,
            UserFacilityUnit.unit_id == unit_id,
        )
    )
    return [uid for uid in rows.scalars().all() if uid != exclude_user_id]


async def _call_recipients(session: AsyncSession, call: InAppCall, exclude_user_id: uuid.UUID) -> List[uuid.UUID]:
    """Recipients for an existing call: its unit's clinicians (or facility fallback)."""
    return await _unit_recipients(session, call.callee_facility_id, call.callee_unit_id, exclude_user_id)


@router.post("/in-app", response_model=InAppCallOut, status_code=201)
async def initiate_call(
    payload: InAppCallCreate,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Call a clinical unit at a receiving hospital: ring the clinicians who work in
    that unit; whoever is logged in can pick up, and the first to answer connects. The
    caller sends the WebRTC offer once answered."""
    recipients = await _unit_recipients(session, payload.facility_id, payload.unit_id, current_user.id)
    # No clinician in that unit is reachable — don't leave the caller ringing into the
    # void. Record the attempt as MISSED and tell them why.
    if not recipients:
        call = InAppCall(
            caller_id=current_user.id,
            callee_facility_id=payload.facility_id,
            callee_unit_id=payload.unit_id,
            referral_id=payload.referral_id,
            status=InAppCallStatus.MISSED,
            ended_at=_now(),
        )
        session.add(call)
        await session.commit()
        raise ValidationError(
            "No clinician in this unit is available to take the call right now."
        )
    call = InAppCall(
        caller_id=current_user.id,
        callee_facility_id=payload.facility_id,
        callee_unit_id=payload.unit_id,
        referral_id=payload.referral_id,
        status=InAppCallStatus.RINGING,
    )
    session.add(call)
    await session.commit()
    call = await _load(session, call.id)
    caller_name = call.caller.full_name if call.caller else "Unknown"
    facility_name = call.callee_facility.name if call.callee_facility else None
    unit_name = call.callee_unit.name if call.callee_unit else None
    for uid in recipients:
        await _notify(uid, {
            "event": "CALL_INCOMING",
            "call_id": str(call.id),
            "caller_id": str(call.caller_id),
            "caller_name": caller_name,
            "facility_name": facility_name,
            "unit_name": unit_name,
            "referral_id": str(call.referral_id) if call.referral_id else None,
        })
    return _out(call)


@router.post("/in-app/ambulance", response_model=InAppCallOut, status_code=201)
async def initiate_call_to_ambulance(
    payload: AmbulanceCallCreate,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """A clinician calls a facility's ambulance — the driver's phone app rings."""
    amb = await session.get(Ambulance, payload.ambulance_id)
    if not amb or not amb.is_active:
        raise NotFoundError("Ambulance")
    if amb.facility_id is None:
        raise ValidationError("This ambulance is not attached to a facility.")
    call = InAppCall(
        caller_id=current_user.id,
        callee_facility_id=amb.facility_id,
        callee_ambulance_id=amb.id,
        referral_id=payload.referral_id,
        status=InAppCallStatus.RINGING,
    )
    session.add(call)
    await session.commit()
    call = await _load(session, call.id)
    await _notify_channel(ambulance_call_channel(amb.id), {
        "event": "CALL_INCOMING",
        "call_id": str(call.id),
        "caller_id": str(call.caller_id) if call.caller_id else None,
        "caller_name": call.caller.full_name if call.caller else "Clinician",
        "referral_id": str(call.referral_id) if call.referral_id else None,
    })
    return _out(call)


# ── Shared call-lifecycle helpers (used by the driver/ambulance router too) ──────────

async def answer_call_for(session: AsyncSession, call: InAppCall, answered_by_label: str) -> InAppCall:
    """Mark a ringing call answered and notify the caller. Caller may be a user or
    an ambulance — notification is routed to the right channel."""
    if call.status != InAppCallStatus.RINGING:
        raise ValidationError("This call has already been answered or ended")
    call.status = InAppCallStatus.ONGOING
    call.started_at = _now()
    await session.commit()
    await _notify_channel(_caller_channel(call), {
        "event": "CALL_ANSWERED",
        "call_id": str(call.id),
        "answered_by": answered_by_label,
    })
    return await _load(session, call.id)


async def end_call_for(session: AsyncSession, call: InAppCall, is_caller: bool) -> InAppCall:
    """End a call from either party (user or ambulance) and notify the other side."""
    if call.status in (InAppCallStatus.ENDED, InAppCallStatus.DECLINED, InAppCallStatus.MISSED, InAppCallStatus.CANCELLED):
        return call
    was_ringing = call.status == InAppCallStatus.RINGING
    call.status = InAppCallStatus.MISSED if was_ringing else InAppCallStatus.ENDED
    call.ended_at = _now()
    await session.commit()
    if was_ringing and not call.callee_ambulance_id and not call.callee_id:
        # Unit call given up before pickup — stop every rung clinician's phone.
        for uid in await _call_recipients(session, call, call.caller_id or uuid.uuid4()):
            await _notify(uid, {"event": "CALL_ENDED", "call_id": str(call.id), "status": call.status.value})
    else:
        other = _callee_channel(call) if is_caller else _caller_channel(call)
        await _notify_channel(other, {"event": "CALL_ENDED", "call_id": str(call.id), "status": call.status.value})
    return await _load(session, call.id)


async def relay_signal_for(session: AsyncSession, call: InAppCall, from_label: str, is_caller: bool, kind: str, data) -> None:
    other = _callee_channel(call) if is_caller else _caller_channel(call)
    if other is None:
        return
    await _notify_channel(other, {
        "event": "CALL_SIGNAL",
        "call_id": str(call.id),
        "from_user": from_label,
        "kind": kind,
        "data": data,
    })


@router.post("/in-app/{call_id}/answer", response_model=InAppCallOut)
async def answer_call(
    call_id: uuid.UUID,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Someone at the facility picks up. The first to answer takes the call; the
    others are told it was taken so their ringing stops."""
    call = await _load(session, call_id)
    if call.status != InAppCallStatus.RINGING:
        raise ValidationError("This call has already been answered or ended")
    call.status = InAppCallStatus.ONGOING
    call.callee_id = current_user.id
    call.started_at = _now()
    await session.commit()
    await _notify_channel(_caller_channel(call), {
        "event": "CALL_ANSWERED",
        "call_id": str(call.id),
        "answered_by": current_user.full_name,
    })
    # Stop the other clinicians' phones ringing (only for unit calls).
    if call.callee_unit_id or call.callee_ambulance_id is None:
        for uid in await _call_recipients(session, call, current_user.id):
            await _notify(uid, {"event": "CALL_TAKEN", "call_id": str(call.id)})
    return _out(await _load(session, call_id))


@router.post("/in-app/{call_id}/end", response_model=InAppCallOut)
async def end_call(
    call_id: uuid.UUID,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Hang up. Either party may end; the status reflects whether it had connected
    (ENDED) or was cancelled before anyone answered (CANCELLED)."""
    call = await _load(session, call_id)
    is_caller = current_user.id == call.caller_id
    if not is_caller and call.callee_id not in (None, current_user.id):
        raise ForbiddenError()
    if call.status in (InAppCallStatus.ENDED, InAppCallStatus.DECLINED, InAppCallStatus.MISSED, InAppCallStatus.CANCELLED):
        return _out(call)
    # A call that ended before anyone picked up is a missed call; once answered, a
    # hang-up by either party is a normal completed call.
    was_ringing = call.status == InAppCallStatus.RINGING
    call.status = InAppCallStatus.MISSED if was_ringing else InAppCallStatus.ENDED
    call.ended_at = _now()
    await session.commit()
    if was_ringing:
        # Caller gave up before anyone answered — stop every rung phone / the callee app.
        if call.callee_ambulance_id:
            await _notify_channel(_callee_channel(call), {"event": "CALL_ENDED", "call_id": str(call.id), "status": call.status.value})
        else:
            for uid in await _call_recipients(session, call, call.caller_id or uuid.uuid4()):
                await _notify(uid, {"event": "CALL_ENDED", "call_id": str(call.id), "status": call.status.value})
    else:
        other = _callee_channel(call) if is_caller else _caller_channel(call)
        await _notify_channel(other, {"event": "CALL_ENDED", "call_id": str(call.id), "status": call.status.value})
    return _out(await _load(session, call_id))


@router.post("/in-app/{call_id}/signal", status_code=204)
async def relay_signal(
    call_id: uuid.UUID,
    payload: CallSignalIn,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Relay a WebRTC signaling message (SDP offer/answer or ICE candidate) to the
    other party of the call over their per-user WebSocket channel."""
    call = await _load(session, call_id)
    if current_user.id not in (call.caller_id, call.callee_id):
        raise ForbiddenError()
    other = _callee_channel(call) if current_user.id == call.caller_id else _caller_channel(call)
    if other is None:
        return None  # not connected yet — nothing to relay to
    await _notify_channel(other, {
        "event": "CALL_SIGNAL",
        "call_id": str(call.id),
        "from_user": str(current_user.id),
        "kind": payload.kind,
        "data": payload.data,
    })
    return None


@router.get("/in-app/log", response_model=List[InAppCallOut])
async def list_in_app_calls_log(
    status: Optional[InAppCallStatus] = Query(None),
    limit: int = Query(300, le=500),
    offset: int = Query(0),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Call log scoped to the viewer:
    - Super admins see every call.
    - Facility admins see every call involving their facility (placed by a member or
      rung to any of its units).
    - Other users (clinicians) see calls placed by them or rung to a unit they work in
      at their facility."""
    stmt = select(InAppCall).options(
        selectinload(InAppCall.caller).selectinload(User.facility_roles),
        selectinload(InAppCall.callee),
        selectinload(InAppCall.callee_facility),
        selectinload(InAppCall.callee_unit),
        selectinload(InAppCall.caller_ambulance),
        selectinload(InAppCall.callee_ambulance),
    )
    roles = current_user.effective_roles
    if "SUPER_ADMIN" not in roles:
        facility_id = current_user.active_facility_id
        if facility_id is None:
            return []
        if "FACILITY_ADMIN" in roles:
            member_ids = select(UserFacilityRole.user_id).where(
                UserFacilityRole.facility_id == facility_id
            )
            stmt = stmt.where(
                or_(
                    InAppCall.callee_facility_id == facility_id,
                    InAppCall.caller_id.in_(member_ids),
                )
            )
        else:
            # Clinician: only their own calls and calls rung to a unit they work in.
            my_unit_ids = [fu.unit_id for fu in current_user.units_for_facility(facility_id)]
            conds = [InAppCall.caller_id == current_user.id]
            if my_unit_ids:
                conds.append(
                    and_(
                        InAppCall.callee_facility_id == facility_id,
                        InAppCall.callee_unit_id.in_(my_unit_ids),
                    )
                )
            stmt = stmt.where(or_(*conds))
    if status is not None:
        stmt = stmt.where(InAppCall.status == status)
    stmt = stmt.order_by(InAppCall.created_at.desc()).offset(offset).limit(limit)
    rows = (await session.execute(stmt)).scalars().all()
    return [_out(c) for c in rows]


@router.get("/in-app", response_model=List[InAppCallOut])
async def list_in_app_calls(
    referral_id: Optional[uuid.UUID] = Query(None),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """In-app call history. Scoped to a referral when given, else the current user's
    own calls (placed or received)."""
    stmt = select(InAppCall).options(
        selectinload(InAppCall.caller).selectinload(User.facility_roles),
        selectinload(InAppCall.callee),
        selectinload(InAppCall.callee_facility),
        selectinload(InAppCall.callee_unit),
        selectinload(InAppCall.caller_ambulance),
        selectinload(InAppCall.callee_ambulance),
    )
    if referral_id is not None:
        stmt = stmt.where(InAppCall.referral_id == referral_id)
    else:
        stmt = stmt.where(or_(InAppCall.caller_id == current_user.id, InAppCall.callee_id == current_user.id))
    stmt = stmt.order_by(InAppCall.created_at.desc()).limit(100)
    rows = (await session.execute(stmt)).scalars().all()
    return [_out(c) for c in rows]
