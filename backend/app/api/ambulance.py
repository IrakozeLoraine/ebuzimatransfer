import uuid
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_roles, get_current_user
from app.core.exceptions import NotFoundError
from app.models.ambulance import AmbulanceLocationPing
from app.models.referral import Referral
from app.models.facility import Facility
from app.services.audit_service import AuditService
from app.websocket.manager import ws_manager
from app.schemas.ambulance import (
    LocationPingCreate,
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


@router.post("/{referral_id}/pings", response_model=LocationPingOut, status_code=201)
async def report_ping(
    referral_id: uuid.UUID,
    payload: LocationPingCreate,
    current_user=Depends(require_roles("CLINICIAN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """Record a live GPS position for an ambulance in transit (referring clinician)."""
    await _get_referral(session, referral_id)
    ping = AmbulanceLocationPing(
        referral_id=referral_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        reported_by=current_user.id,
    )
    session.add(ping)
    await AuditService(session).log(
        "REPORT_AMBULANCE_PING", "ambulance", user_id=current_user.id, entity_id=referral_id
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
    """Route endpoints plus the ordered GPS trail for a transfer request."""
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

    return AmbulanceTrack(
        referral_id=referral_id,
        origin=_route_point(origin),
        destination=_route_point(destination),
        pings=[LocationPingOut.model_validate(p) for p in pings],
        latest=LocationPingOut.model_validate(pings[-1]) if pings else None,
    )
