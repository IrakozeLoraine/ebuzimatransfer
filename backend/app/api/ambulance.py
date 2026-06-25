import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import get_current_user
from app.core.exceptions import NotFoundError
from app.models.ambulance import AmbulanceLocationPing
from app.models.referral import Referral
from app.models.facility import Facility
from app.models.transport import TransportEvent
from app.services.routing import road_route
from app.schemas.ambulance import (
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
