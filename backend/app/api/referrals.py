import os
import json
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.permissions import require_roles, get_current_user
from app.core.exceptions import ValidationError, NotFoundError
from app.services.referral_service import ReferralService
from app.services.audit_service import AuditService
from app.services.notification_service import NotificationService
from app.services.dictation_service import DictationService, audio_path, monitoring_audio_path
from app.websocket.manager import ws_manager
from app.models.referral import ReferralStatus
from app.schemas.referral import ReferralCreate, ReferralDraftCreate, ReferralUpdate, ReferralOut, ReferralSummary, AcceptReferralRequest, RejectReferralRequest, ArrivalConditionRequest, ReferralFeedbackRequest, DictationResult

# Cap dictated recordings at ~25 MB (well over a minute of speech) to bound
# transcription time and upload size.
_MAX_AUDIO_BYTES = 25 * 1024 * 1024

router = APIRouter()


def _active_facility_id(user) -> Optional[uuid.UUID]:
    """The facility a user is acting from: their active facility, or their only one."""
    active = getattr(user, "active_facility_id", None)
    if active is not None:
        return active
    facilities = getattr(user, "facilities", [])
    return facilities[0].id if len(facilities) == 1 else None


async def _link_coordination_calls(session, referral, caller_id, call_log_id) -> None:
    """Tie coordination calls placed before the form was filled to a freshly created
    referral, so both sides see them in its history: the explicitly passed call log,
    plus any recent in-app calls this clinician placed to the chosen destination."""
    if call_log_id is not None:
        from app.models.call import CallLog
        call = await session.get(CallLog, call_log_id)
        if call is not None and call.referral_id is None:
            call.referral_id = referral.id

    if referral.preferred_facility_id is not None:
        from datetime import datetime, timezone, timedelta
        from sqlalchemy import select
        from app.models.incall import InAppCall
        cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
        recent = await session.execute(
            select(InAppCall).where(
                InAppCall.caller_id == caller_id,
                InAppCall.callee_facility_id == referral.preferred_facility_id,
                InAppCall.referral_id.is_(None),
                InAppCall.created_at >= cutoff,
            )
        )
        for call in recent.scalars().all():
            call.referral_id = referral.id


def _accept_notification_message(referral) -> str:
    """Message for the requester when a request is approved, spelling out how many
    resources were reserved and naming any that couldn't be (accept holds whatever
    is still available). Expects a get_with_relations-loaded referral."""
    reserved_ids = set(referral.reserved_resource_ids)
    reserved = len(reserved_ids)
    unreserved = [r.resource_name for r in referral.requested_resources if r.id not in reserved_ids]
    msg = f"{referral.referral_number} was approved — {reserved} resource{'' if reserved == 1 else 's'} reserved."
    if unreserved:
        msg += f" Could not reserve: {', '.join(unreserved)} (no longer available)."
    return msg


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
    # Link earlier coordination calls (placed before the form was filled) to this
    # referral, so both sides see them in the referral's history.
    await _link_coordination_calls(session, referral, current_user.id, payload.call_log_id)
    await AuditService(session).log("CREATE_REFERRAL", "referral", user_id=current_user.id, entity_id=referral.id)
    notif = NotificationService(session)
    title = "New transfer request"
    message = f"{referral.referral_number}: {referral.diagnosis}"
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


@router.post("/draft", response_model=ReferralOut, status_code=201)
async def create_draft_referral(
    payload: ReferralDraftCreate,
    current_user=Depends(require_roles("CLINICIAN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """Create a call-first lightweight referral: only the destination and requested
    resources are given. The phone call coordinates it (no in-app accept step), so the
    referring clinician can arrange transport straight away and complete the full MoH
    transfer form later. The receiving side is not asked to approve, so no approval
    notification is sent here — the transport step notifies them a patient is coming."""
    svc = ReferralService(session)
    active_facility_id = _active_facility_id(current_user)
    units = current_user.units_for_facility(active_facility_id)
    origin_unit_id = units[0].unit_id if len(units) == 1 else None
    referral = await svc.create_draft(
        payload,
        current_user.id,
        active_facility_id,
        origin_unit_id=origin_unit_id,
    )
    await _link_coordination_calls(session, referral, current_user.id, payload.call_log_id)
    await AuditService(session).log("CREATE_DRAFT_REFERRAL", "referral", user_id=current_user.id, entity_id=referral.id)
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_CREATED", "referral_id": str(referral.id)})
    return await svc.get(referral.id)


@router.patch("/{referral_id}", response_model=ReferralOut)
async def complete_referral_form(
    referral_id: uuid.UUID,
    payload: ReferralUpdate,
    current_user=Depends(require_roles("CLINICIAN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """Fill in (or edit) the transfer form after creation — used to complete the full
    MoH form for a call-first lightweight referral. Only the referring side may do this.
    The receiving side is notified the full form is now available."""
    svc = ReferralService(session)
    referral = await svc.complete_form(referral_id, payload, current_user)
    await AuditService(session).log("COMPLETE_REFERRAL_FORM", "referral", user_id=current_user.id, entity_id=referral_id)
    receiving_facility_id = referral.accepted_facility_id or referral.preferred_facility_id
    if receiving_facility_id:
        await NotificationService(session).notify_facility_unit(
            receiving_facility_id, referral.requested_unit_id, "CLINICIAN",
            "Transfer form completed",
            f"{referral.referral_number}: the referring facility completed the transfer form.",
            "REFERRAL_UPDATED", "referral", referral_id, exclude_user_id=current_user.id,
        )
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_UPDATED", "referral_id": str(referral_id)})
    return await svc.get(referral_id)


@router.post("/transcribe", response_model=DictationResult)
async def transcribe_referral(
    audio: UploadFile = File(...),
    form_spec: Optional[str] = Form(None),
    current_user=Depends(require_roles("CLINICIAN", "SUPER_ADMIN")),
):
    """Turn a dictated recording into a prefilled transfer request: transcribe the
    audio, extract the core fields and a summary, and store the recording. When
    ``form_spec`` (a JSON list of the chosen MoH form's fields) is supplied, the
    form-specific values are extracted too. The clinician reviews and edits the
    result before submitting — nothing is persisted here."""
    audio_bytes = await audio.read()
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise ValidationError("Recording is too large — keep it under ~25 MB")
    spec = None
    if form_spec:
        try:
            parsed = json.loads(form_spec)
            if isinstance(parsed, list):
                spec = parsed
        except (json.JSONDecodeError, TypeError):
            spec = None
    return await DictationService().transcribe_to_form(
        audio_bytes, audio.filename or "referral.webm", form_spec=spec
    )


@router.get("/audio/{filename}")
async def get_referral_audio(filename: str):
    """Stream a kept dictation recording for playback. Public (no auth) because an
    <audio> tag can't send a bearer token; filenames are unguessable UUIDs and the
    name is validated against path traversal."""
    path = audio_path(filename)
    if path is None or not os.path.isfile(path):
        raise NotFoundError("Recording")
    return FileResponse(path)


@router.get("/monitoring-audio/{filename}")
async def get_monitoring_audio(filename: str):
    """Stream a kept transport-monitoring recording for playback. Public for the
    same reason as referral audio; filenames are unguessable UUIDs validated
    against path traversal."""
    path = monitoring_audio_path(filename)
    if path is None or not os.path.isfile(path):
        raise NotFoundError("Recording")
    return FileResponse(path)


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
    await svc.accept(referral_id, payload, current_user)
    full = await svc.get(referral_id)
    await AuditService(session).log("ACCEPT_REFERRAL", "referral", user_id=current_user.id, entity_id=referral_id)
    await NotificationService(session).create(
        full.created_by, "Transfer request approved",
        _accept_notification_message(full),
        "REFERRAL_ACCEPTED", "referral", referral_id,
    )
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_ACCEPTED", "referral_id": str(referral_id)})
    await ws_manager.broadcast_to_channel("capacity", {"event": "RESOURCE_UPDATED"})
    return full


@router.post("/{referral_id}/quick-accept", response_model=ReferralOut)
async def quick_accept_referral(
    referral_id: uuid.UUID,
    current_user=Depends(require_roles("CLINICIAN", "FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """One-click approve: reserve every requested resource that's still available."""
    svc = ReferralService(session)
    await svc.accept(referral_id, AcceptReferralRequest(), current_user)
    full = await svc.get(referral_id)
    await AuditService(session).log("ACCEPT_REFERRAL", "referral", user_id=current_user.id, entity_id=referral_id)
    await NotificationService(session).create(
        full.created_by, "Transfer request approved",
        _accept_notification_message(full),
        "REFERRAL_ACCEPTED", "referral", referral_id,
    )
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_ACCEPTED", "referral_id": str(referral_id)})
    await ws_manager.broadcast_to_channel("capacity", {"event": "RESOURCE_UPDATED"})
    return full


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
    referral = await svc.mark_arrived(referral_id, current_user)
    await AuditService(session).log("MARK_ARRIVED", "referral", user_id=current_user.id, entity_id=referral_id)
    await NotificationService(session).create(
        referral.created_by, "Patient has arrived",
        f"{referral.referral_number}: the receiving facility confirmed the patient arrived.",
        "REFERRAL_ARRIVED", "referral", referral_id,
    )
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_ARRIVED", "referral_id": str(referral_id)})
    return await svc.get(referral_id)


@router.patch("/{referral_id}/feedback", response_model=ReferralOut)
async def save_referral_feedback(
    referral_id: uuid.UUID,
    payload: ReferralFeedbackRequest,
    current_user=Depends(require_roles("CLINICIAN", "FACILITY_ADMIN", "SUPER_ADMIN")),
    session: AsyncSession = Depends(get_session),
):
    """The receiving facility fills the Referral Feedback / Counter-Referral for a
    transferred patient. The referring side is notified."""
    svc = ReferralService(session)
    referral = await svc.save_feedback(
        referral_id, payload.feedback_data, payload.counter_referral_data, current_user
    )
    await AuditService(session).log("SAVE_REFERRAL_FEEDBACK", "referral", user_id=current_user.id, entity_id=referral_id)
    await NotificationService(session).create(
        referral.created_by, "Referral feedback available",
        f"{referral.referral_number}: the receiving facility added feedback / counter-referral.",
        "REFERRAL_FEEDBACK", "referral", referral_id,
    )
    await session.commit()
    await ws_manager.broadcast_to_channel("referrals", {"event": "REFERRAL_FEEDBACK", "referral_id": str(referral_id)})
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
    await svc.set_arrival_condition(referral_id, payload.arrival_condition, current_user)
    await AuditService(session).log(
        "RECORD_ARRIVAL_CONDITION", "referral", user_id=current_user.id, entity_id=referral_id
    )
    await session.commit()
    await ws_manager.broadcast_to_channel(
        "referrals", {"event": "REFERRAL_ARRIVAL_CONDITION", "referral_id": str(referral_id)}
    )
    return await svc.get(referral_id)
