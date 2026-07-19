from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, List, Tuple
from pydantic import BaseModel


# --------------------------------------------------------------------------- #
# Ambulance management (facility admin / super admin)
# --------------------------------------------------------------------------- #

class AmbulanceCreate(BaseModel):
    plate_number: str
    # Optional driver details — handy but not required.
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    facility_id: Optional[uuid.UUID] = None
    # The driver login ID is the plate number; the server generates the password
    # and reveals it once (no admin-chosen logins or passwords to leak or reuse).


class AmbulanceUpdate(BaseModel):
    plate_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    is_active: Optional[bool] = None
    # Password resets go through the dedicated reset endpoint, which regenerates
    # and reveals a fresh password — there is no admin-supplied password here.


class AmbulanceOut(BaseModel):
    id: uuid.UUID
    facility_id: Optional[uuid.UUID]
    facility_name: Optional[str] = None
    plate_number: str
    driver_name: Optional[str]
    driver_phone: Optional[str]
    login_id: str
    is_active: bool
    # Derived: AVAILABLE, or ON_JOURNEY when assigned to an in-progress transfer.
    status: str = "AVAILABLE"
    created_at: datetime

    model_config = {"from_attributes": True}


class AmbulanceCredentials(AmbulanceOut):
    """Returned only at registration or password reset: the same ambulance plus the
    one-time plaintext ``password``. The admin shows or QR-codes this to the driver;
    the server never stores or returns the plaintext again."""
    password: str


# --------------------------------------------------------------------------- #
# Driver phone app
# --------------------------------------------------------------------------- #

class DriverLogin(BaseModel):
    login_id: str
    password: str


class DriverToken(BaseModel):
    token: str
    ambulance: AmbulanceOut


class DriverPing(BaseModel):
    """A GPS fix streamed by the driver's phone during a journey."""
    latitude: float
    longitude: float


class RoutePoint(BaseModel):
    name: str
    latitude: float
    longitude: float


class DriverJourney(BaseModel):
    """The single journey currently assigned to the driver's ambulance, with the
    sending/receiving facilities and which step the driver is on."""
    transport_id: uuid.UUID
    referral_id: uuid.UUID
    referral_number: str
    # ASSIGNED -> EN_ROUTE_TO_PICKUP -> PATIENT_ONBOARD -> ARRIVED
    step: str
    sending: Optional[RoutePoint] = None
    receiving: Optional[RoutePoint] = None
    dispatch_time: Optional[datetime] = None
    pickup_time: Optional[datetime] = None
    arrival_time: Optional[datetime] = None


# --------------------------------------------------------------------------- #
# Live tracking (web)
# --------------------------------------------------------------------------- #

class LocationPingOut(BaseModel):
    id: uuid.UUID
    referral_id: uuid.UUID
    latitude: float
    longitude: float
    ambulance_id: Optional[uuid.UUID] = None
    recorded_at: datetime

    model_config = {"from_attributes": True}


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


class DriverRoute(BaseModel):
    """Road route from the ambulance's current position to its destination, for the
    driver app's map. The phone cannot reach OSRM directly — it is bound to loopback
    on the host — so the backend routes on its behalf."""
    # Ordered [lat, lng] points. Two points means the straight-line fallback.
    route: List[Tuple[float, float]] = []
    duration_s: float
    distance_m: float
    destination: Optional[RoutePoint] = None