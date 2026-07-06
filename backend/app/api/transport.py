import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_session
from app.core.permissions import require_roles
from app.core.exceptions import NotFoundError, ConflictError, ForbiddenError
from app.models.ambulance import Ambulance
from app.models.transport import TransportEvent
from app.models.referral import Referral, ReferralStatus
from app.services.referral_service import ReferralService
from app.services.audit_service import AuditService
from app.services.notification_service import NotificationService
from app.websocket.manager import ws_manager
from app.schemas.transport import TransportCreate, TransportOut

router = APIRouter()


async def _notify_receiving(session: AsyncSession, referral: Referral, title: str, message: str, event_type: str) -> None:
    """Notify the receiving facility's clinicians (in the requested unit) about a
    transport update. Falls back to all the facility's clinicians if no unit is set."""
    receiving_facility_id = referral.accepted_facility_id or referral.preferred_facility_id
    if not receiving_facility_id:
        return
    await NotificationService(session).notify_facility_unit(
        receiving_facility_id, referral.requested_unit_id, "CLINICIAN",
        title, message, event_type, "referral", referral.id,
    )


@router.post("", response_model=TransportOut, status_code=201)
async def create_transport(
    payload: TransportCreate,
    current_user=Depends(require_roles("CLINICIAN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """The referring clinician assigns an available ambulance to an accepted
    request. Plate and driver are snapshotted from the ambulance, and the
    receiving hospital is notified that a patient is coming. The driver then
    drives the journey from their phone app."""
    referral = await session.get(Referral, payload.referral_id)
    if not referral:
        raise NotFoundError("Referral")
    # Only the referring (sending) side arranges transport — never the receiving facility.
    svc = ReferralService(session)
    svc.assert_can_arrange_transport(referral, current_user)

    ambulance = await session.get(Ambulance, payload.ambulance_id)
    if not ambulance or not ambulance.is_active:
        raise NotFoundError("Ambulance")
    # A non-super clinician may only dispatch their own facility's ambulances.
    if "SUPER_ADMIN" not in set(current_user.effective_roles):
        if ambulance.facility_id not in {f.id for f in current_user.facilities}:
            raise ForbiddenError()

    # Refuse to double-book an ambulance already on a journey.
    busy = await session.scalar(
        select(TransportEvent).where(
            TransportEvent.ambulance_id == ambulance.id, TransportEvent.arrival_time.is_(None)
        )
    )
    if busy:
        raise ConflictError("This ambulance is already on a journey")

    event = TransportEvent(
        referral_id=payload.referral_id,
        ambulance_id=ambulance.id,
        ambulance_identifier=ambulance.plate_number,
        driver_name=ambulance.driver_name,
        driver_phone=ambulance.driver_phone,
        created_by=current_user.id,
    )
    session.add(event)

    referral = await svc.change_status(payload.referral_id, ReferralStatus.TRANSPORT_ARRANGED, current_user.id)
    await _notify_receiving(
        session, referral, "Incoming patient — transport arranged",
        f"{referral.referral_number}: transport arranged ({ambulance.plate_number}).",
        "REFERRAL_TRANSPORT_ARRANGED",
    )
    await AuditService(session).log("CREATE_TRANSPORT", "transport", user_id=current_user.id, entity_id=payload.referral_id)
    await session.commit()
    await session.refresh(event)
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_TRANSPORT_ARRANGED", "referral_id": str(payload.referral_id)})
    return event


@router.delete("/{referral_id}", status_code=200)
async def remove_transport(
    referral_id: uuid.UUID,
    current_user=Depends(require_roles("CLINICIAN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """Remove the assigned ambulance from a referral before the journey has started,
    freeing the ambulance and returning the request to ACCEPTED so a different
    ambulance can be assigned."""
    referral = await session.get(Referral, referral_id)
    if not referral:
        raise NotFoundError("Referral")
    # Referring side only — the receiving facility never runs the transport.
    svc = ReferralService(session)
    svc.assert_can_arrange_transport(referral, current_user)

    event = await session.scalar(
        select(TransportEvent)
        .where(TransportEvent.referral_id == referral_id, TransportEvent.arrival_time.is_(None))
        .order_by(TransportEvent.created_at.desc())
    )
    if not event:
        raise NotFoundError("Transport")
    if event.dispatch_time is not None:
        raise ConflictError("The journey has already started — the ambulance can't be removed.")

    await session.delete(event)
    referral = await svc.change_status(referral_id, ReferralStatus.ACCEPTED, current_user.id)
    await _notify_receiving(
        session, referral, "Transport changed",
        f"{referral.referral_number}: the assigned ambulance was removed; a new one will be arranged.",
        "REFERRAL_TRANSPORT_REMOVED",
    )
    await AuditService(session).log("REMOVE_TRANSPORT", "transport", user_id=current_user.id, entity_id=referral_id)
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_TRANSPORT_REMOVED", "referral_id": str(referral_id)})
    return {"success": True}
