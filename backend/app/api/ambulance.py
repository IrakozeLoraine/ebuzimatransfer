import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import get_current_user, get_current_device
from app.core.exceptions import NotFoundError, ConflictError
from app.models.ambulance import AmbulanceLocationPing
from app.models.referral import Referral
from app.models.facility import Facility
from app.models.transport import TransportEvent
from app.services.audit_service import AuditService
from app.services.routing import road_route
from app.websocket.manager import ws_manager
from app.schemas.ambulance import (
    DevicePingCreate,
    LocationPingOut,
    AmbulanceTrack,
    RoutePoint,
)

router = APIRouter()


def _route_point(facility: Optional[Facility]) -> Optional[RoutePoint]:
    if facility and facility.latitude is not None and facility.longitude is not None:
        return RoutePoint(name=facility.name, latitude=facility.latitude, longitude=facility.longitude)
    return None


async def _get_referral(session: AsyncSession, referral_id: uuid.UUID) -> Referral:
    referral = await session.get(Referral, referral_id)
    if not referral:
        raise NotFoundError("Transfer request")
    return referral


@router.post("/devices/ping", response_model=LocationPingOut, status_code=201)
async def device_ping(
    payload: DevicePingCreate,
    device=Depends(get_current_device),
    session: AsyncSession = Depends(get_session),
):
    """Ingest a GPS position from a hardware tracker.

    The device is resolved to the journey it is currently assigned to (the most
    recent transport event referencing it that has not yet arrived), and the
    position is recorded against that transfer request.
    """
    transport = await session.scalar(
        select(TransportEvent)
        .where(TransportEvent.device_id == device.id, TransportEvent.arrival_time.is_(None))
        .order_by(TransportEvent.created_at.desc())
    )
    if not transport:
        raise ConflictError("This device is not assigned to an active journey")

    referral_id = transport.referral_id
    ping = AmbulanceLocationPing(
        referral_id=referral_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        device_id=device.id,
    )
    session.add(ping)
    await AuditService(session).log(
        "REPORT_AMBULANCE_PING", "ambulance", entity_id=referral_id
    )
    await session.commit()
    await session.refresh(ping)
    await ws_manager.broadcast_to_channel(
        f"ambulance:{referral_id}",
        {
            "event": "AMBULANCE_PING",
            "referral_id": str(referral_id),
            "latitude": ping.latitude,
            "longitude": ping.longitude,
            "recorded_at": ping.recorded_at.isoformat(),
        },
    )
    return ping


@router.get("/{referral_id}/track", response_model=AmbulanceTrack)
async def get_track(
    referral_id: uuid.UUID,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Route endpoints, the ordered GPS trail, the planned road route, and a
    road-routed ETA for a transfer request."""
    referral = await _get_referral(session, referral_id)

    origin = await session.get(Facility, referral.referring_facility_id) if referral.referring_facility_id else None
    dest_id = referral.accepted_facility_id or referral.preferred_facility_id
    destination = await session.get(Facility, dest_id) if dest_id else None

    result = await session.execute(
        select(AmbulanceLocationPing)
        .where(AmbulanceLocationPing.referral_id == referral_id)
        .order_by(AmbulanceLocationPing.recorded_at.asc())
    )
    pings = list(result.scalars())

    # Journey timing from the latest transport event for this referral.
    transport = await session.scalar(
        select(TransportEvent)
        .where(TransportEvent.referral_id == referral_id)
        .order_by(TransportEvent.created_at.desc())
    )
    origin_pt = _route_point(origin)
    destination_pt = _route_point(destination)
    departure_time = transport.departure_time if transport else None
    arrival_time = transport.arrival_time if transport else None

    route_geometry = None
    estimated_arrival_time = None
    if origin_pt and destination_pt and not arrival_time:
        # Planned route (origin → destination) for the map overlay.
        planned = await road_route(
            origin_pt.latitude, origin_pt.longitude,
            destination_pt.latitude, destination_pt.longitude,
        )
        if planned:
            route_geometry = planned.geometry

        # ETA from the ambulance's current position (latest ping) to the
        # destination; before any ping, fall back to the planned-route duration.
        latest = pings[-1] if pings else None
        if latest:
            live = await road_route(
                latest.latitude, latest.longitude,
                destination_pt.latitude, destination_pt.longitude,
            )
            if live:
                now = datetime.now(timezone.utc).replace(microsecond=0)
                estimated_arrival_time = now + timedelta(seconds=live.duration_s)
        elif planned and departure_time:
            estimated_arrival_time = departure_time + timedelta(seconds=planned.duration_s)

    return AmbulanceTrack(
        referral_id=referral_id,
        origin=origin_pt,
        destination=destination_pt,
        pings=[LocationPingOut.model_validate(p) for p in pings],
        latest=LocationPingOut.model_validate(pings[-1]) if pings else None,
        route=route_geometry,
        departure_time=departure_time,
        estimated_arrival_time=estimated_arrival_time,
        arrival_time=arrival_time,
    )
