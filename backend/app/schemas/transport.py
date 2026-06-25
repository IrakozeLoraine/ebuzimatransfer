from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class TransportCreate(BaseModel):
    """The referring clinician assigns one of their facility's available
    ambulances to an accepted transfer. Plate and driver details come from the
    ambulance record — nothing is typed by hand."""
    referral_id: uuid.UUID
    ambulance_id: uuid.UUID


class TransportOut(BaseModel):
    id: uuid.UUID
    referral_id: uuid.UUID
    ambulance_id: Optional[uuid.UUID]
    ambulance_identifier: str
    driver_name: Optional[str]
    driver_phone: Optional[str]
    dispatch_time: Optional[datetime]
    pickup_time: Optional[datetime]
    departure_time: Optional[datetime]
    arrival_time: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
