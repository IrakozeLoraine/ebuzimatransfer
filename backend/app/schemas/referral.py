from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from app.models.referral import ReferralStatus


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


class StatusHistoryOut(BaseModel):
    id: uuid.UUID
    status: ReferralStatus
    changed_by: uuid.UUID
    comment: Optional[str]
    created_at: datetime

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
    created_by: uuid.UUID
    referring_facility_id: Optional[uuid.UUID]
    preferred_facility_id: Optional[uuid.UUID]
    accepted_facility_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime
    status_history: List[StatusHistoryOut] = []

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
