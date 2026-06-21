import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_roles, get_current_user
from app.services.referral_service import ReferralService
from app.services.audit_service import AuditService
from app.services.notification_service import NotificationService
from app.websocket.manager import ws_manager
from app.models.referral import ReferralStatus
from app.schemas.referral import ReferralCreate, ReferralOut, ReferralSummary, AcceptReferralRequest, RejectReferralRequest

router = APIRouter()


@router.get("", response_model=List[ReferralSummary])
async def list_referrals(
    status: Optional[ReferralStatus] = Query(None),
    facility_id: Optional[uuid.UUID] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    svc = ReferralService(session)
    own_only = "REFERRING_CLINICIAN" in current_user.role_names
    return await svc.list(
        status=status,
        facility_id=facility_id,
        created_by=current_user.id if own_only else None,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=ReferralOut, status_code=201)
async def create_referral(
    payload: ReferralCreate,
    current_user=Depends(require_roles("REFERRING_CLINICIAN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = ReferralService(session)
    referral = await svc.create(payload, current_user.id, current_user.primary_facility_id)
    await AuditService(session).log("CREATE_REFERRAL", "referral", user_id=current_user.id, entity_id=referral.id)
    notif = NotificationService(session)
    await notif.notify_role("ICU_COORDINATOR", "New Referral", f"Referral {referral.referral_number} received", "NEW_REFERRAL")
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_CREATED", "referral_id": str(referral.id)})
    return await svc.get(referral.id)


@router.get("/{referral_id}", response_model=ReferralOut)
async def get_referral(
    referral_id: uuid.UUID,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await ReferralService(session).get(referral_id)


@router.post("/{referral_id}/accept", response_model=ReferralOut)
async def accept_referral(
    referral_id: uuid.UUID,
    payload: AcceptReferralRequest,
    current_user=Depends(require_roles("ICU_COORDINATOR", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = ReferralService(session)
    referral = await svc.accept(referral_id, payload, current_user.id)
    await AuditService(session).log("ACCEPT_REFERRAL", "referral", user_id=current_user.id, entity_id=referral_id)
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_ACCEPTED", "referral_id": str(referral_id)})
    await ws_manager.broadcast_to_channel("capacity", {"event": "RESOURCE_UPDATED"})
    return await svc.get(referral_id)


@router.post("/{referral_id}/reject", response_model=ReferralOut)
async def reject_referral(
    referral_id: uuid.UUID,
    payload: RejectReferralRequest,
    current_user=Depends(require_roles("ICU_COORDINATOR", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = ReferralService(session)
    referral = await svc.reject(referral_id, payload, current_user.id)
    await AuditService(session).log("REJECT_REFERRAL", "referral", user_id=current_user.id, entity_id=referral_id)
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_REJECTED", "referral_id": str(referral_id)})
    return await svc.get(referral_id)


@router.patch("/{referral_id}/status")
async def update_status(
    referral_id: uuid.UUID,
    status: ReferralStatus = Query(...),
    current_user=Depends(require_roles("ICU_COORDINATOR", "AMBULANCE_COORDINATOR", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = ReferralService(session)
    referral = await svc.change_status(referral_id, status, current_user.id)
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": f"REFERRAL_{status.value}", "referral_id": str(referral_id)})
    return {"success": True, "status": status.value}
