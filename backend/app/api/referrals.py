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
from app.schemas.referral import ReferralCreate, ReferralOut, ReferralSummary, AcceptReferralRequest, RejectReferralRequest, ArrivalConditionRequest

router = APIRouter()


def _active_facility_id(user) -> Optional[uuid.UUID]:
    """The facility a user is acting from: their active facility, or their only one."""
    active = getattr(user, "active_facility_id", None)
    if active is not None:
        return active
    facilities = getattr(user, "facilities", [])
    return facilities[0].id if len(facilities) == 1 else None


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
    return await svc.list_visible(current_user, status=status, limit=limit, offset=offset)


@router.post("", response_model=ReferralOut, status_code=201)
async def create_referral(
    payload: ReferralCreate,
    current_user=Depends(require_roles("CLINICIAN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = ReferralService(session)
    active_facility_id = _active_facility_id(current_user)
    # Derive the originating unit from the clinician's units at their active facility.
    # If they work in exactly one, attribute the request to it; if several, leave it
    # unset rather than guessing (the receiving side scopes on the requested unit).
    units = current_user.units_for_facility(active_facility_id)
    origin_unit_id = units[0].unit_id if len(units) == 1 else None
    referral = await svc.create(
        payload,
        current_user.id,
        active_facility_id,
        origin_unit_id=origin_unit_id,
    )
    await AuditService(session).log("CREATE_REFERRAL", "referral", user_id=current_user.id, entity_id=referral.id)
    notif = NotificationService(session)
    title = "New transfer request"
    message = f"{referral.referral_number}: {referral.diagnosis} ({referral.urgency})"
    # Notify the receiving side — clinicians in the requested unit at the destination.
    if referral.preferred_facility_id and referral.requested_unit_id:
        await notif.notify_facility_unit(
            referral.preferred_facility_id, referral.requested_unit_id, "CLINICIAN",
            title, message, "NEW_REFERRAL", "referral", referral.id, exclude_user_id=current_user.id,
        )
    else:
        await notif.notify_role("CLINICIAN", title, message, "NEW_REFERRAL", "referral", referral.id)
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
    current_user=Depends(require_roles("CLINICIAN", "FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = ReferralService(session)
    referral = await svc.accept(referral_id, payload, current_user)
    await AuditService(session).log("ACCEPT_REFERRAL", "referral", user_id=current_user.id, entity_id=referral_id)
    await NotificationService(session).create(
        referral.created_by, "Transfer request approved",
        f"{referral.referral_number} was approved — a resource is reserved.",
        "REFERRAL_ACCEPTED", "referral", referral_id,
    )
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_ACCEPTED", "referral_id": str(referral_id)})
    await ws_manager.broadcast_to_channel("capacity", {"event": "RESOURCE_UPDATED"})
    return await svc.get(referral_id)


@router.post("/{referral_id}/quick-accept", response_model=ReferralOut)
async def quick_accept_referral(
    referral_id: uuid.UUID,
    current_user=Depends(require_roles("CLINICIAN", "FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """One-click approve: auto-pick an available resource in the requested unit at
    the receiving clinician's facility, then accept."""
    from app.core.exceptions import ValidationError
    svc = ReferralService(session)
    facility_id = _active_facility_id(current_user)
    if facility_id is None:
        raise ValidationError("Could not determine your facility")
    resource_id = await svc.auto_pick_resource(referral_id, facility_id)
    if resource_id is None:
        raise ValidationError("No available resource in the requested unit at your facility")
    referral = await svc.accept(referral_id, AcceptReferralRequest(resource_id=resource_id), current_user)
    await AuditService(session).log("ACCEPT_REFERRAL", "referral", user_id=current_user.id, entity_id=referral_id)
    await NotificationService(session).create(
        referral.created_by, "Transfer request approved",
        f"{referral.referral_number} was approved — a resource is reserved.",
        "REFERRAL_ACCEPTED", "referral", referral_id,
    )
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_ACCEPTED", "referral_id": str(referral_id)})
    await ws_manager.broadcast_to_channel("capacity", {"event": "RESOURCE_UPDATED"})
    return await svc.get(referral_id)


@router.post("/{referral_id}/reject", response_model=ReferralOut)
async def reject_referral(
    referral_id: uuid.UUID,
    payload: RejectReferralRequest,
    current_user=Depends(require_roles("CLINICIAN", "FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = ReferralService(session)
    referral = await svc.reject(referral_id, payload, current_user)
    await AuditService(session).log("REJECT_REFERRAL", "referral", user_id=current_user.id, entity_id=referral_id)
    await NotificationService(session).create(
        referral.created_by, "Transfer request rejected",
        f"{referral.referral_number}: {payload.reason}",
        "REFERRAL_REJECTED", "referral", referral_id,
    )
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_REJECTED", "referral_id": str(referral_id)})
    return await svc.get(referral_id)


@router.patch("/{referral_id}/status")
async def update_status(
    referral_id: uuid.UUID,
    status: ReferralStatus = Query(...),
    current_user=Depends(require_roles("CLINICIAN", "FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    svc = ReferralService(session)
    referral = await svc.change_status(referral_id, status, current_user.id)
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": f"REFERRAL_{status.value}", "referral_id": str(referral_id)})
    return {"success": True, "status": status.value}


@router.post("/{referral_id}/mark-arrived", response_model=ReferralOut)
async def mark_arrived(
    referral_id: uuid.UUID,
    current_user=Depends(require_roles("CLINICIAN", "FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """Confirm a patient arrived for a transfer that used no tracked transport.
    The receiving clinician records arrival; the referring clinician is notified."""
    svc = ReferralService(session)
    referral = await svc.change_status(referral_id, ReferralStatus.ARRIVED, current_user.id)
    await AuditService(session).log("MARK_ARRIVED", "referral", user_id=current_user.id, entity_id=referral_id)
    await NotificationService(session).create(
        referral.created_by, "Patient has arrived",
        f"{referral.referral_number}: the receiving facility confirmed the patient arrived.",
        "REFERRAL_ARRIVED", "referral", referral_id,
    )
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_ARRIVED", "referral_id": str(referral_id)})
    return await svc.get(referral_id)


@router.post("/{referral_id}/arrival-condition", response_model=ReferralOut)
async def record_arrival_condition(
    referral_id: uuid.UUID,
    payload: ArrivalConditionRequest,
    current_user=Depends(require_roles("CLINICIAN", "FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """The receiving clinician records the patient's condition on arrival."""
    svc = ReferralService(session)
    await svc.set_arrival_condition(referral_id, payload.arrival_condition, current_user.id)
    await AuditService(session).log(
        "RECORD_ARRIVAL_CONDITION", "referral", user_id=current_user.id, entity_id=referral_id
    )
    await session.commit()
    await ws_manager.broadcast_to_channel(
        "referrals", {"event": "REFERRAL_ARRIVAL_CONDITION", "referral_id": str(referral_id)}
    )
    return await svc.get(referral_id)
