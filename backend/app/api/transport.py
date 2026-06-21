import uuid
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_session
from app.core.permissions import require_roles, get_current_user
from app.models.transport import TransportEvent
from app.models.referral import ReferralStatus
from app.services.referral_service import ReferralService
from app.services.audit_service import AuditService
from app.websocket.manager import ws_manager
from app.schemas.transport import TransportCreate, TransportUpdate, TransportOut

router = APIRouter()


@router.get("/queue", response_model=List)
async def transport_queue(
    current_user=Depends(require_roles("AMBULANCE_COORDINATOR", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = ReferralService(session)
    return await svc.get_transport_queue()


@router.post("", response_model=TransportOut, status_code=201)
async def create_transport(
    payload: TransportCreate,
    current_user=Depends(require_roles("AMBULANCE_COORDINATOR", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    event = TransportEvent(
        referral_id=payload.referral_id,
        ambulance_identifier=payload.ambulance_identifier,
        driver_name=payload.driver_name,
        driver_phone=payload.driver_phone,
        created_by=current_user.id,
    )
    session.add(event)

    svc = ReferralService(session)
    await svc.change_status(payload.referral_id, ReferralStatus.TRANSPORT_ARRANGED, current_user.id)
    await AuditService(session).log("CREATE_TRANSPORT", "transport", user_id=current_user.id, entity_id=payload.referral_id)
    await session.commit()
    await session.refresh(event)
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_TRANSPORT_ARRANGED", "referral_id": str(payload.referral_id)})
    return event


@router.patch("/{transport_id}", response_model=TransportOut)
async def update_transport(
    transport_id: uuid.UUID,
    payload: TransportUpdate,
    current_user=Depends(require_roles("AMBULANCE_COORDINATOR", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(TransportEvent).where(TransportEvent.id == transport_id))
    event = result.scalar_one_or_none()
    if not event:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Transport event")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(event, field, value)

    if payload.arrival_time:
        svc = ReferralService(session)
        await svc.change_status(event.referral_id, ReferralStatus.ARRIVED, current_user.id)
        await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_ARRIVED", "referral_id": str(event.referral_id)})
    elif payload.departure_time:
        svc = ReferralService(session)
        await svc.change_status(event.referral_id, ReferralStatus.EN_ROUTE, current_user.id)

    await session.commit()
    return event
