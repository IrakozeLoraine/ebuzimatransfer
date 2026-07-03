from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel
from app.models.incall import InAppCallStatus


class InAppCallCreate(BaseModel):
    """Call a clinical unit at a receiving hospital; clinicians who work in that unit
    are rung. ``unit_id`` omitted falls back to the whole-facility desk."""
    facility_id: uuid.UUID
    unit_id: Optional[uuid.UUID] = None
    referral_id: Optional[uuid.UUID] = None


class AmbulanceCallCreate(BaseModel):
    """A clinician calls a facility's ambulance; the driver's phone app rings."""
    ambulance_id: uuid.UUID
    referral_id: Optional[uuid.UUID] = None


class DriverCallCreate(BaseModel):
    """An ambulance driver calls a clinic for a referral. ``side`` chooses which end —
    "receiving" (destination) or "referring" (origin) — whose unit clinicians ring."""
    referral_id: uuid.UUID
    side: str = "receiving"


class CallSignalIn(BaseModel):
    """A WebRTC signaling message relayed to the other party of a call:
    ``kind`` is "offer" | "answer" | "ice"; ``data`` is the SDP or ICE candidate."""
    kind: str
    data: Any


class InAppCallOut(BaseModel):
    id: uuid.UUID
    caller_id: Optional[uuid.UUID] = None
    caller_name: Optional[str] = None
    caller_facility_id: Optional[uuid.UUID] = None
    caller_facility_name: Optional[str] = None
    caller_ambulance_id: Optional[uuid.UUID] = None
    callee_facility_id: uuid.UUID
    callee_facility_name: Optional[str] = None
    callee_unit_id: Optional[uuid.UUID] = None
    callee_unit_name: Optional[str] = None
    callee_id: Optional[uuid.UUID] = None
    callee_name: Optional[str] = None
    callee_ambulance_id: Optional[uuid.UUID] = None
    referral_id: Optional[uuid.UUID] = None
    status: InAppCallStatus
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}
