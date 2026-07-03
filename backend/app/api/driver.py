import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import get_current_ambulance
from app.core.security import verify_password, create_driver_token
from app.core.exceptions import UnauthorizedError, NotFoundError, ConflictError, ValidationError, ForbiddenError
from app.models.ambulance import Ambulance, AmbulanceLocationPing
from app.models.facility import Facility
from app.models.referral import Referral, ReferralStatus
from app.models.transport import TransportEvent
from app.services.referral_service import ReferralService
from app.services.notification_service import NotificationService
from app.services.audit_service import AuditService
from app.services.dictation_service import DictationService
from app.websocket.manager import ws_manager
from app.schemas.ambulance import (
    DriverLogin,
    DriverToken,
    DriverJourney,
    DriverPing,
    RoutePoint,
    AmbulanceOut,
)
from app.schemas.referral import TransportMonitoringResult

# Cap monitoring recordings at ~25 MB — same bound as referral dictation.
_MAX_AUDIO_BYTES = 25 * 1024 * 1024

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _route_point(facility: Optional[Facility]) -> Optional[RoutePoint]:
    if facility and facility.latitude is not None and facility.longitude is not None:
        return RoutePoint(name=facility.name, latitude=facility.latitude, longitude=facility.longitude)
    return None


def _step(t: TransportEvent) -> str:
    if t.arrival_time:
        return "ARRIVED"
    if t.pickup_time:
        return "PATIENT_ONBOARD"
    if t.dispatch_time:
        return "EN_ROUTE_TO_PICKUP"
    return "ASSIGNED"


async def _active_transport(session: AsyncSession, ambulance_id: uuid.UUID) -> Optional[TransportEvent]:
    return await session.scalar(
        select(TransportEvent)
        .where(TransportEvent.ambulance_id == ambulance_id, TransportEvent.arrival_time.is_(None))
        .order_by(TransportEvent.created_at.desc())
    )


async def _build_journey(session: AsyncSession, t: TransportEvent) -> DriverJourney:
    referral = await session.get(Referral, t.referral_id)
    sending = await session.get(Facility, referral.referring_facility_id) if referral.referring_facility_id else None
    dest_id = referral.accepted_facility_id or referral.preferred_facility_id
    receiving = await session.get(Facility, dest_id) if dest_id else None
    return DriverJourney(
        transport_id=t.id,
        referral_id=t.referral_id,
        referral_number=referral.referral_number,
        step=_step(t),
        sending=_route_point(sending),
        receiving=_route_point(receiving),
        dispatch_time=t.dispatch_time,
        pickup_time=t.pickup_time,
        arrival_time=t.arrival_time,
    )


@router.post("/login", response_model=DriverToken)
async def driver_login(payload: DriverLogin, session: AsyncSession = Depends(get_session)):
    """Sign the driver's phone app in with the ambulance login set by the facility."""
    amb = await session.scalar(
        select(Ambulance)
        .where(Ambulance.login_id == payload.login_id.strip())
        .options(selectinload(Ambulance.facility))
    )
    if not amb or not amb.is_active or not verify_password(payload.password, amb.password_hash):
        raise UnauthorizedError("Invalid login or inactive ambulance")
    return DriverToken(
        token=create_driver_token(str(amb.id)),
        ambulance=AmbulanceOut(
            id=amb.id,
            facility_id=amb.facility_id,
            facility_name=amb.facility.name if amb.facility else None,
            plate_number=amb.plate_number,
            driver_name=amb.driver_name,
            driver_phone=amb.driver_phone,
            login_id=amb.login_id,
            is_active=amb.is_active,
            status="AVAILABLE",
            created_at=amb.created_at,
        ),
    )


@router.get("/journey", response_model=Optional[DriverJourney])
async def current_journey(
    ambulance=Depends(get_current_ambulance),
    session: AsyncSession = Depends(get_session),
):
    """The single in-progress journey assigned to this ambulance, or null."""
    t = await _active_transport(session, ambulance.id)
    if not t:
        return None
    return await _build_journey(session, t)


@router.get("/journeys", response_model=list[DriverJourney])
async def journey_history(
    ambulance=Depends(get_current_ambulance),
    session: AsyncSession = Depends(get_session),
):
    """This ambulance's completed journeys, most recent arrival first."""
    rows = await session.scalars(
        select(TransportEvent)
        .where(
            TransportEvent.ambulance_id == ambulance.id,
            TransportEvent.arrival_time.isnot(None),
        )
        .order_by(TransportEvent.arrival_time.desc())
        .limit(50)
    )
    return [await _build_journey(session, t) for t in rows]


async def _load_active_transport(session: AsyncSession, ambulance) -> TransportEvent:
    t = await _active_transport(session, ambulance.id)
    if not t:
        raise NotFoundError("Active journey")
    return t


async def _notify_receiving(session: AsyncSession, referral: Referral, title: str, message: str, event: str) -> None:
    receiving_facility_id = referral.accepted_facility_id or referral.preferred_facility_id
    if not receiving_facility_id:
        return
    await NotificationService(session).notify_facility_unit(
        receiving_facility_id, referral.requested_unit_id, "CLINICIAN",
        title, message, event, "referral", referral.id,
    )


@router.post("/journey/start", response_model=DriverJourney)
async def start_journey(
    ambulance=Depends(get_current_ambulance),
    session: AsyncSession = Depends(get_session),
):
    """Driver taps **Start journey** — the ambulance is on its way to collect the patient."""
    t = await _load_active_transport(session, ambulance)
    if t.dispatch_time:
        raise ConflictError("The journey has already started")
    t.dispatch_time = _now()
    referral = await ReferralService(session).change_status(t.referral_id, ReferralStatus.EN_ROUTE, None)
    await _notify_receiving(
        session, referral, "Ambulance en route",
        f"{referral.referral_number}: the ambulance is on the way.", "REFERRAL_EN_ROUTE",
    )
    await AuditService(session).log("DRIVER_START_JOURNEY", "transport", entity_id=t.referral_id)
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_EN_ROUTE", "referral_id": str(t.referral_id)})
    return await _build_journey(session, t)


@router.post("/journey/picked", response_model=DriverJourney)
async def patient_picked(
    ambulance=Depends(get_current_ambulance),
    session: AsyncSession = Depends(get_session),
):
    """Driver taps **Patient picked up** — patient is onboard, heading to the receiving facility."""
    t = await _load_active_transport(session, ambulance)
    if not t.dispatch_time:
        raise ConflictError("Start the journey first")
    if t.pickup_time:
        raise ConflictError("The patient is already onboard")
    now = _now()
    t.pickup_time = now
    t.departure_time = now
    await AuditService(session).log("DRIVER_PATIENT_PICKED", "transport", entity_id=t.referral_id)
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_EN_ROUTE", "referral_id": str(t.referral_id)})
    return await _build_journey(session, t)


@router.post("/journey/arrived", response_model=DriverJourney)
async def patient_arrived(
    ambulance=Depends(get_current_ambulance),
    session: AsyncSession = Depends(get_session),
):
    """Driver taps **Patient arrived** — the patient has reached the receiving facility."""
    t = await _load_active_transport(session, ambulance)
    if not t.pickup_time:
        raise ConflictError("Mark the patient as picked up first")
    t.arrival_time = _now()
    referral = await ReferralService(session).change_status(t.referral_id, ReferralStatus.ARRIVED, None)
    await NotificationService(session).create(
        referral.created_by, "Patient has arrived",
        f"{referral.referral_number}: the patient has arrived at the receiving facility.",
        "REFERRAL_ARRIVED", "referral", referral.id,
    )
    await AuditService(session).log("DRIVER_PATIENT_ARRIVED", "transport", entity_id=t.referral_id)
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_ARRIVED", "referral_id": str(t.referral_id)})
    return await _build_journey(session, t)


@router.post("/journey/monitoring", response_model=TransportMonitoringResult)
async def record_monitoring(
    audio: UploadFile = File(...),
    ambulance=Depends(get_current_ambulance),
    session: AsyncSession = Depends(get_session),
):
    """Driver records the Patient Monitoring Transfer Form by voice during transport.
    The recording is transcribed, the vitals/problem log is extracted, and the
    result is stored on the active journey's referral for both clinics and admins
    to see on the web."""
    t = await _load_active_transport(session, ambulance)
    audio_bytes = await audio.read()
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise ValidationError("Recording is too large — keep it under ~25 MB")

    result = await DictationService().transcribe_monitoring(
        audio_bytes, audio.filename or "monitoring.m4a"
    )
    result.recorded_at = _now()

    referral = await session.get(Referral, t.referral_id)
    referral.transport_monitoring = result.model_dump(mode="json")

    # Let both sides know fresh monitoring is available to review.
    await _notify_receiving(
        session, referral, "Transport monitoring recorded",
        f"{referral.referral_number}: the ambulance logged the patient's monitoring.",
        "REFERRAL_MONITORING",
    )
    await NotificationService(session).create(
        referral.created_by, "Transport monitoring recorded",
        f"{referral.referral_number}: the ambulance logged the patient's monitoring.",
        "REFERRAL_MONITORING", "referral", referral.id,
    )
    await AuditService(session).log("DRIVER_RECORD_MONITORING", "referral", entity_id=t.referral_id)
    await session.commit()
    await ws_manager.broadcast_to_channel(
        "referrals", {"event": "REFERRAL_MONITORING", "referral_id": str(t.referral_id)}
    )
    return result


@router.post("/journey/ping", status_code=201)
async def journey_ping(
    payload: DriverPing,
    ambulance=Depends(get_current_ambulance),
    session: AsyncSession = Depends(get_session),
):
    """Stream the phone's current GPS position for the active journey."""
    t = await _active_transport(session, ambulance.id)
    if not t:
        raise ConflictError("This ambulance is not on an active journey")
    ping = AmbulanceLocationPing(
        referral_id=t.referral_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        ambulance_id=ambulance.id,
    )
    session.add(ping)
    await session.commit()
    await session.refresh(ping)
    await ws_manager.broadcast_to_channel(
        f"ambulance:{t.referral_id}",
        {
            "event": "AMBULANCE_PING",
            "referral_id": str(t.referral_id),
            "latitude": ping.latitude,
            "longitude": ping.longitude,
            "recorded_at": ping.recorded_at.isoformat(),
        },
    )
    return {"status": "ok"}


# ── In-app calling (ambulance driver side) ──────────────────────────────────────────
# The driver app subscribes to ``ambulance-call:{ambulance_id}`` over the WebSocket to
# receive CALL_INCOMING / CALL_ANSWERED / CALL_SIGNAL / CALL_ENDED events, and uses
# these endpoints to place, answer, end and signal calls (WebRTC media is P2P).
from app.models.incall import InAppCall, InAppCallStatus
from app.api.incall import (
    _load as _load_call,
    _out as _out_call,
    _unit_recipients,
    _notify,
    ambulance_call_channel,
    answer_call_for,
    end_call_for,
    relay_signal_for,
)
from app.schemas.incall import DriverCallCreate, InAppCallOut, CallSignalIn


def _amb_label(amb: Ambulance) -> str:
    return f"Ambulance {amb.plate_number}" + (f" ({amb.driver_name})" if amb.driver_name else "")


def _amb_is_party(call: InAppCall, amb: Ambulance) -> tuple[bool, bool]:
    """(is_party, is_caller) for an ambulance principal on a call."""
    if call.caller_ambulance_id == amb.id:
        return True, True
    if call.callee_ambulance_id == amb.id:
        return True, False
    return False, False


@router.post("/calls", response_model=InAppCallOut, status_code=201)
async def driver_start_call(
    payload: DriverCallCreate,
    ambulance=Depends(get_current_ambulance),
    session: AsyncSession = Depends(get_session),
):
    """The driver calls a clinic for a referral — the receiving or referring unit's
    clinicians are rung; the first to answer connects."""
    referral = await session.get(Referral, payload.referral_id)
    if not referral:
        raise NotFoundError("Referral")
    if payload.side == "referring":
        target_facility = referral.referring_facility_id
        target_unit = referral.origin_unit_id
    else:
        target_facility = referral.accepted_facility_id or referral.preferred_facility_id
        target_unit = referral.requested_unit_id
    if not target_facility:
        raise ValidationError("That side of the transfer has no facility set.")

    recipients = await _unit_recipients(session, target_facility, target_unit, uuid.uuid4())
    if not recipients:
        call = InAppCall(
            caller_ambulance_id=ambulance.id,
            callee_facility_id=target_facility,
            callee_unit_id=target_unit,
            referral_id=referral.id,
            status=InAppCallStatus.MISSED,
            ended_at=_now(),
        )
        session.add(call)
        await session.commit()
        raise ValidationError("No clinician in that unit is available to take the call right now.")

    call = InAppCall(
        caller_ambulance_id=ambulance.id,
        callee_facility_id=target_facility,
        callee_unit_id=target_unit,
        referral_id=referral.id,
        status=InAppCallStatus.RINGING,
    )
    session.add(call)
    await session.commit()
    call = await _load_call(session, call.id)
    for uid in recipients:
        await _notify(uid, {
            "event": "CALL_INCOMING",
            "call_id": str(call.id),
            "caller_name": _amb_label(ambulance),
            "facility_name": call.callee_facility.name if call.callee_facility else None,
            "unit_name": call.callee_unit.name if call.callee_unit else None,
            "referral_id": str(call.referral_id) if call.referral_id else None,
        })
    return _out_call(call)


@router.post("/calls/{call_id}/answer", response_model=InAppCallOut)
async def driver_answer_call(
    call_id: uuid.UUID,
    ambulance=Depends(get_current_ambulance),
    session: AsyncSession = Depends(get_session),
):
    """The driver answers a clinician's incoming call to this ambulance."""
    call = await _load_call(session, call_id)
    if call.callee_ambulance_id != ambulance.id:
        raise ForbiddenError()
    return _out_call(await answer_call_for(session, call, _amb_label(ambulance)))


@router.post("/calls/{call_id}/end", response_model=InAppCallOut)
async def driver_end_call(
    call_id: uuid.UUID,
    ambulance=Depends(get_current_ambulance),
    session: AsyncSession = Depends(get_session),
):
    """The driver hangs up a call they're part of."""
    call = await _load_call(session, call_id)
    is_party, is_caller = _amb_is_party(call, ambulance)
    if not is_party:
        raise ForbiddenError()
    return _out_call(await end_call_for(session, call, is_caller))


@router.post("/calls/{call_id}/signal", status_code=204)
async def driver_relay_signal(
    call_id: uuid.UUID,
    payload: CallSignalIn,
    ambulance=Depends(get_current_ambulance),
    session: AsyncSession = Depends(get_session),
):
    """Relay a WebRTC signaling message from the driver to the other party."""
    call = await _load_call(session, call_id)
    is_party, is_caller = _amb_is_party(call, ambulance)
    if not is_party:
        raise ForbiddenError()
    await relay_signal_for(session, call, ambulance_call_channel(ambulance.id), is_caller, payload.kind, payload.data)
    return None
