from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from app.models.referral import ReferralStatus, ArrivalCondition


class ReferralCreate(BaseModel):
    patient_code: str
    age_band: str
    sex: str
    diagnosis: str
    comorbidities: Optional[str] = None
    acuity_level: str
    urgency: str
    reason_for_transfer: str
    ventilator_needed: bool = False
    high_flow_oxygen_needed: bool = False
    preferred_facility_id: Optional[uuid.UUID] = None
    requested_unit_id: Optional[uuid.UUID] = None


class ReferralUpdate(BaseModel):
    diagnosis: Optional[str] = None
    acuity_level: Optional[str] = None
    urgency: Optional[str] = None
    reason_for_transfer: Optional[str] = None
    ventilator_needed: Optional[bool] = None
    high_flow_oxygen_needed: Optional[bool] = None


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
    changed_by: uuid.UUID
    comment: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class TransportEventRef(BaseModel):
    id: uuid.UUID
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
    age_band: str
    sex: str
    diagnosis: str
    comorbidities: Optional[str]
    acuity_level: str
    urgency: str
    reason_for_transfer: str
    ventilator_needed: bool
    high_flow_oxygen_needed: bool
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
    urgency: str
    status: ReferralStatus
    created_at: datetime
    referring_facility_id: Optional[uuid.UUID]

    model_config = {"from_attributes": True}
