from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class LocationPingCreate(BaseModel):
    latitude: float
    longitude: float


class LocationPingOut(BaseModel):
    id: uuid.UUID
    referral_id: uuid.UUID
    latitude: float
    longitude: float
    reported_by: Optional[uuid.UUID]
    recorded_at: datetime

    model_config = {"from_attributes": True}


class RoutePoint(BaseModel):
    name: str
    latitude: float
    longitude: float


class AmbulanceTrack(BaseModel):
    """Everything the map needs: route endpoints plus the GPS trail."""
    referral_id: uuid.UUID
    origin: Optional[RoutePoint] = None
    destination: Optional[RoutePoint] = None
    pings: List[LocationPingOut] = []
    latest: Optional[LocationPingOut] = None
