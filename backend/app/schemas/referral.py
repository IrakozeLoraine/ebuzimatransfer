from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field, field_validator
from app.models.referral import ReferralStatus, ArrivalCondition


class ReferralCreate(BaseModel):
    sex: str
    diagnosis: str
    reason_for_transfer: str
    # Which MoH transfer-form variant was used, and its form-specific field values
    # (a flat map keyed by field name — see the frontend transfer-form definitions).
    form_type: str = "EXTERNAL"
    form_data: Optional[dict[str, Any]] = None
    # The destination is required so a request is always routed to a specific
    # facility + unit (and only that side's staff can approve it).
    preferred_facility_id: uuid.UUID
    requested_unit_id: uuid.UUID
    # The resources being requested at the destination — one or more distinct
    # resources, each validated as currently available at the preferred facility
    # when creating the request.
    requested_resource_ids: List[uuid.UUID] = Field(min_length=1)
    # Optional voice-dictation artifacts, carried over from /referrals/transcribe
    # so the recording, transcript, and summary are stored with the referral.
    audio_url: Optional[str] = None
    transcript: Optional[str] = None
    ai_summary: Optional[str] = None
    # When the request follows a coordination call placed before the form was filled,
    # the call log's id — the new referral is linked back to it so both sides see it.
    call_log_id: Optional[uuid.UUID] = None


class ReferralDraftCreate(BaseModel):
    """A call-first "lightweight" referral: only the destination and requested
    resources are required. The detailed MoH transfer form (clinical fields and
    ``form_data``) is filled in later via ``ReferralUpdate``. Such a referral skips
    the in-app accept/reservation step — the phone call is the coordination — and
    goes straight to transport."""
    preferred_facility_id: uuid.UUID
    requested_unit_id: uuid.UUID
    requested_resource_ids: List[uuid.UUID] = Field(min_length=1)
    call_log_id: Optional[uuid.UUID] = None


class DictationFields(BaseModel):
    """Form fields extracted from a dictated transcript. Every field is optional —
    the clinician reviews and corrects before submitting."""
    sex: Optional[str] = None
    diagnosis: Optional[str] = None
    reason_for_transfer: Optional[str] = None


class DictationResult(BaseModel):
    """Response of /referrals/transcribe: the kept audio, the transcript, a short
    summary for the receiving clinic, and the extracted fields to prefill the form."""
    audio_url: Optional[str] = None
    transcript: str
    summary: str
    fields: DictationFields
    # Form-specific values extracted for the chosen MoH form variant (keyed by the
    # field names in the frontend transfer-form definitions). Empty when no form
    # spec was sent or nothing matched.
    form_data: dict[str, Any] = {}


class MonitoringVitalRow(BaseModel):
    """One vital-signs reading taken during transport (every ~30 minutes)."""
    time: Optional[str] = None
    bp: Optional[str] = None
    temp: Optional[str] = None
    spo2: Optional[str] = None
    rr: Optional[str] = None
    pulse: Optional[str] = None
    fhr: Optional[str] = None
    membranes_ruptured: Optional[str] = None


class MonitoringProblemRow(BaseModel):
    """A problem encountered during transport and how it was managed."""
    problem: Optional[str] = None
    management: Optional[str] = None


class TransportMonitoringResult(BaseModel):
    """The Patient Monitoring Transfer Form as recorded by the driver's voice:
    the kept recording, its transcript and summary, and the extracted log."""
    audio_url: Optional[str] = None
    transcript: str
    summary: str
    vital_signs: List[MonitoringVitalRow] = []
    problems: List[MonitoringProblemRow] = []
    recorded_at: Optional[datetime] = None


class ReferralUpdate(BaseModel):
    """Completing (or editing) the transfer form for a referral after creation —
    used to fill in the full MoH form for a call-first lightweight referral. Every
    field is optional; only what's provided is written."""
    sex: Optional[str] = None
    diagnosis: Optional[str] = None
    reason_for_transfer: Optional[str] = None
    form_type: Optional[str] = None
    form_data: Optional[dict[str, Any]] = None


class ReferralFeedbackRequest(BaseModel):
    """Receiving-side Referral Feedback and/or Counter-Referral. Either may be sent;
    each is a flat map keyed by the receiving-form field names."""
    feedback_data: Optional[dict[str, Any]] = None
    counter_referral_data: Optional[dict[str, Any]] = None


class AcceptReferralRequest(BaseModel):
    # Accepting reserves every resource the request asked for, so no resource is
    # chosen here — only the optional planned admission time applied to them all.
    planned_admission_time: Optional[datetime] = None


class RequestedResourceOut(BaseModel):
    """A resource named on a request, surfaced with its name so both facilities
    can see what was asked for (resolved server-side; the requesting side can't
    look up the destination's resources by id)."""
    id: uuid.UUID
    resource_name: str

    model_config = {"from_attributes": True}


class RejectReferralRequest(BaseModel):
    reason: str
    comment: Optional[str] = None


class ArrivalConditionRequest(BaseModel):
    arrival_condition: ArrivalCondition


class TransitStats(BaseModel):
    """Aggregate transit-duration stats (EN_ROUTE → ARRIVED), in minutes."""
    completed_journeys: int
    average_minutes: Optional[float] = None
    fastest_minutes: Optional[float] = None
    slowest_minutes: Optional[float] = None
    # Count of recorded patient arrival conditions, keyed by ArrivalCondition value.
    arrival_conditions: dict[str, int] = {}


class StatusHistoryOut(BaseModel):
    id: uuid.UUID
    status: ReferralStatus
    # Null when the change came from an ambulance driver (no staff user).
    changed_by: Optional[uuid.UUID] = None
    comment: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class TransportEventRef(BaseModel):
    id: uuid.UUID
    ambulance_id: Optional[uuid.UUID] = None
    ambulance_identifier: str
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    dispatch_time: Optional[datetime] = None
    pickup_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    arrival_time: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ReferralOut(BaseModel):
    id: uuid.UUID
    referral_number: str
    sex: str
    diagnosis: str
    reason_for_transfer: str
    form_type: str = "EXTERNAL"
    form_data: Optional[dict[str, Any]] = None
    form_completed: bool = True
    transport_monitorings: List[TransportMonitoringResult] = []
    feedback_data: Optional[dict[str, Any]] = None
    counter_referral_data: Optional[dict[str, Any]] = None
    audio_url: Optional[str] = None
    transcript: Optional[str] = None
    ai_summary: Optional[str] = None
    status: ReferralStatus
    rejection_reason: Optional[str]
    rejection_comment: Optional[str]
    arrival_condition: Optional[str] = None
    created_by: uuid.UUID
    referring_facility_id: Optional[uuid.UUID]
    preferred_facility_id: Optional[uuid.UUID]
    accepted_facility_id: Optional[uuid.UUID]
    origin_unit_id: Optional[uuid.UUID] = None
    requested_unit_id: Optional[uuid.UUID] = None
    requested_resources: List[RequestedResourceOut] = []
    # Which of the requested resources are actually reserved for this request — an
    # accept holds every one that was still available, so this can be a subset.
    reserved_resource_ids: List[uuid.UUID] = []
    created_at: datetime
    updated_at: datetime
    status_history: List[StatusHistoryOut] = []
    transport_events: List[TransportEventRef] = []

    @field_validator("transport_monitorings", mode="before")
    @classmethod
    def _monitorings_default(cls, v: Any) -> Any:
        # The column is null until the first recording; treat that as an empty list.
        return v or []

    model_config = {"from_attributes": True}


class ReferralSummary(BaseModel):
    id: uuid.UUID
    referral_number: str
    diagnosis: str
    status: ReferralStatus
    form_completed: bool = True
    created_at: datetime
    referring_facility_id: Optional[uuid.UUID]

    model_config = {"from_attributes": True}
