from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.call import PhoneLineType


class PhoneLineCreate(BaseModel):
    label: str
    phone_number: str
    line_type: PhoneLineType = PhoneLineType.COORDINATION
    is_active: bool = True


class PhoneLineUpdate(BaseModel):
    label: Optional[str] = None
    phone_number: Optional[str] = None
    line_type: Optional[PhoneLineType] = None
    is_active: Optional[bool] = None


class PhoneLineOut(BaseModel):
    id: uuid.UUID
    facility_id: uuid.UUID
    label: str
    phone_number: str
    line_type: PhoneLineType
    is_active: bool

    model_config = {"from_attributes": True}


class CallLogCreate(BaseModel):
    to_number: str
    to_facility_id: Optional[uuid.UUID] = None
    from_line_id: Optional[uuid.UUID] = None
    referral_id: Optional[uuid.UUID] = None
    purpose: Optional[str] = None
    notes: Optional[str] = None


class CallLogOut(BaseModel):
    id: uuid.UUID
    referral_id: Optional[uuid.UUID]
    to_facility_id: Optional[uuid.UUID]
    to_number: str
    from_line_id: Optional[uuid.UUID]
    purpose: Optional[str]
    notes: Optional[str]
    placed_by: uuid.UUID
    placed_by_name: Optional[str] = None
    from_line_label: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
