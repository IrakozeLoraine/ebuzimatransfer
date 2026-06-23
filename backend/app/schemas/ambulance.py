from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, List, Tuple
from pydantic import BaseModel


class DevicePingCreate(BaseModel):
    """A GPS fix reported by a hardware tracker (authenticated via X-Device-Key)."""
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


class AmbulanceDeviceCreate(BaseModel):
    label: str
    facility_id: Optional[uuid.UUID] = None


class AmbulanceDeviceOut(BaseModel):
    id: uuid.UUID
    label: str
    facility_id: Optional[uuid.UUID]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AmbulanceDeviceCreated(AmbulanceDeviceOut):
    """Returned once, at creation — includes the plaintext key to flash onto the device."""
    api_key: str


class RoutePoint(BaseModel):
    name: str
    latitude: float
    longitude: float


class AmbulanceTrack(BaseModel):
    """Everything the map needs: route endpoints, the GPS trail, and journey times."""
    referral_id: uuid.UUID
    origin: Optional[RoutePoint] = None
    destination: Optional[RoutePoint] = None
    pings: List[LocationPingOut] = []
    latest: Optional[LocationPingOut] = None
    # Planned road route (origin → destination) as ordered [lat, lng] points.
    route: Optional[List[Tuple[float, float]]] = None
    # Journey timing. ETA is computed by real road routing (OSRM) from the
    # ambulance's current position to the destination.
    departure_time: Optional[datetime] = None         # start of the journey
    estimated_arrival_time: Optional[datetime] = None  # ETA via road routing
    arrival_time: Optional[datetime] = None           # actual arrival
