from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class TransportCreate(BaseModel):
    referral_id: uuid.UUID
    ambulance_identifier: str
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None


class TransportUpdate(BaseModel):
    ambulance_identifier: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    dispatch_time: Optional[datetime] = None
    pickup_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    arrival_time: Optional[datetime] = None


class TransportOut(BaseModel):
    id: uuid.UUID
    referral_id: uuid.UUID
    ambulance_identifier: str
    driver_name: Optional[str]
    driver_phone: Optional[str]
    dispatch_time: Optional[datetime]
    pickup_time: Optional[datetime]
    departure_time: Optional[datetime]
    arrival_time: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
