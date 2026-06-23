import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_session
from app.core.permissions import require_roles
from app.core.exceptions import NotFoundError
from app.models.transport import TransportEvent
from app.models.referral import Referral, ReferralStatus
from app.services.referral_service import ReferralService
from app.services.audit_service import AuditService
from app.services.notification_service import NotificationService
from app.websocket.manager import ws_manager
from app.schemas.transport import TransportCreate, TransportUpdate, TransportOut

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
    """The referring clinician arranges transport (their hospital's ambulance) for
    an accepted request, and notifies the receiving hospital a patient is coming."""
    event = TransportEvent(
        referral_id=payload.referral_id,
        ambulance_identifier=payload.ambulance_identifier,
        driver_name=payload.driver_name,
        driver_phone=payload.driver_phone,
        device_id=payload.device_id,
        created_by=current_user.id,
    )
    session.add(event)

    svc = ReferralService(session)
    referral = await svc.change_status(payload.referral_id, ReferralStatus.TRANSPORT_ARRANGED, current_user.id)
    await _notify_receiving(
        session, referral, "Incoming patient — transport arranged",
        f"{referral.referral_number}: transport arranged ({payload.ambulance_identifier}).",
        "REFERRAL_TRANSPORT_ARRANGED",
    )
    await AuditService(session).log("CREATE_TRANSPORT", "transport", user_id=current_user.id, entity_id=payload.referral_id)
    await session.commit()
    await session.refresh(event)
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_TRANSPORT_ARRANGED", "referral_id": str(payload.referral_id)})
    return event


@router.patch("/{transport_id}", response_model=TransportOut)
async def update_transport(
    transport_id: uuid.UUID,
    payload: TransportUpdate,
    current_user=Depends(require_roles("CLINICIAN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(TransportEvent).where(TransportEvent.id == transport_id))
    event = result.scalar_one_or_none()
    if not event:
        raise NotFoundError("Transport event")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(event, field, value)

    svc = ReferralService(session)
    if payload.arrival_time:
        # The receiving clinician confirms arrival; the referring clinician is notified.
        referral = await svc.change_status(event.referral_id, ReferralStatus.ARRIVED, current_user.id)
        await NotificationService(session).create(
            referral.created_by, "Patient has arrived",
            f"{referral.referral_number}: the patient has arrived at the receiving facility.",
            "REFERRAL_ARRIVED", "referral", referral.id,
        )
        await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_ARRIVED", "referral_id": str(event.referral_id)})
    elif payload.departure_time:
        referral = await svc.change_status(event.referral_id, ReferralStatus.EN_ROUTE, current_user.id)
        await _notify_receiving(
            session, referral, "Patient en route",
            f"{referral.referral_number}: the patient is en route.",
            "REFERRAL_EN_ROUTE",
        )
        await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_EN_ROUTE", "referral_id": str(event.referral_id)})

    await session.commit()
    return event
