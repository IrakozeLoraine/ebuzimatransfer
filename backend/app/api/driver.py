import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import get_current_ambulance
from app.core.security import verify_password, create_driver_token
from app.core.exceptions import UnauthorizedError, NotFoundError, ConflictError
from app.models.ambulance import Ambulance, AmbulanceLocationPing
from app.models.facility import Facility
from app.models.referral import Referral, ReferralStatus
from app.models.transport import TransportEvent
from app.services.referral_service import ReferralService
from app.services.notification_service import NotificationService
from app.services.audit_service import AuditService
from app.websocket.manager import ws_manager
from app.schemas.ambulance import (
    DriverLogin,
    DriverToken,
    DriverJourney,
    DriverPing,
    RoutePoint,
    AmbulanceOut,
)

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
