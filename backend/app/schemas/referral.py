from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel
from app.models.referral import ReferralStatus, ArrivalCondition


class ReferralCreate(BaseModel):
    patient_code: Optional[str] = None
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
    # The specific resource being requested at the destination. Validated as
    # currently available at the preferred facility when creating the request.
    requested_resource_id: uuid.UUID
    # Optional voice-dictation artifacts, carried over from /referrals/transcribe
    # so the recording, transcript, and summary are stored with the referral.
    audio_url: Optional[str] = None
    transcript: Optional[str] = None
    ai_summary: Optional[str] = None
    # When the request follows a coordination call placed before the form was filled,
    # the call log's id — the new referral is linked back to it so both sides see it.
    call_log_id: Optional[uuid.UUID] = None


class DictationFields(BaseModel):
    """Form fields extracted from a dictated transcript. Every field is optional —
    the clinician reviews and corrects before submitting."""
    patient_code: Optional[str] = None
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
    diagnosis: Optional[str] = None
    reason_for_transfer: Optional[str] = None


class ReferralFeedbackRequest(BaseModel):
    """Receiving-side Referral Feedback and/or Counter-Referral. Either may be sent;
    each is a flat map keyed by the receiving-form field names."""
    feedback_data: Optional[dict[str, Any]] = None
    counter_referral_data: Optional[dict[str, Any]] = None


class AcceptReferralRequest(BaseModel):
    resource_id: uuid.UUID
    planned_admission_time: Optional[datetime] = None


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
    patient_code: str
    sex: str
    diagnosis: str
    reason_for_transfer: str
    form_type: str = "EXTERNAL"
    form_data: Optional[dict[str, Any]] = None
    transport_monitoring: Optional[dict[str, Any]] = None
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
    requested_resource_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    status_history: List[StatusHistoryOut] = []
    transport_events: List[TransportEventRef] = []

    model_config = {"from_attributes": True}


class ReferralSummary(BaseModel):
    id: uuid.UUID
    referral_number: str
    patient_code: str
    diagnosis: str
    status: ReferralStatus
    created_at: datetime
    referring_facility_id: Optional[uuid.UUID]

    model_config = {"from_attributes": True}
