from __future__ import annotations
import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, model_validator
from app.models.resource import ResourceStatus, ResourceType


class ResourceBase(BaseModel):
    resource_name: str
    resource_code: Optional[str] = None
    notes: Optional[str] = None
    resource_type: Optional[ResourceType] = None
    unit_id: Optional[uuid.UUID] = None
    facility_id: Optional[uuid.UUID] = None


class ResourceCreate(ResourceBase):
    quantity: int = 1


class ResourceUpdate(BaseModel):
    resource_name: Optional[str] = None
    resource_code: Optional[str] = None
    notes: Optional[str] = None


class ResourceCountsUpdate(BaseModel):
    """Set how many of a resource group's units fall into each non-available
    bucket. AVAILABLE is derived, so it is not sent. The counts must be
    non-negative and must not exceed the group's quantity."""
    occupied: int = 0
    reserved: int = 0
    out_of_service: int = 0

    @model_validator(mode="after")
    def _non_negative(self):
        if self.occupied < 0 or self.reserved < 0 or self.out_of_service < 0:
            raise ValueError("Counts cannot be negative")
        return self


class ResourceUnitCount(BaseModel):
    """A number of units to add to or remove from a resource group."""
    count: int

    @model_validator(mode="after")
    def _positive(self):
        if self.count < 1:
            raise ValueError("Count must be at least 1")
        return self


class ResourceAssign(BaseModel):
    """Assign or transfer a resource. Null facility_id/unit_id returns it to central stock."""
    facility_id: Optional[uuid.UUID] = None
    unit_id: Optional[uuid.UUID] = None


class ResourceBulkAssign(BaseModel):
    """Assign or transfer one or more resources at once. A null facility_id returns
    them to central stock (super admin only). Facility admins may only set the unit;
    the facility they belong to is preserved server-side. ``quantity`` is the number
    of units to move from each selected resource (clamped to what's movable); null
    moves every movable unit."""
    resource_ids: List[uuid.UUID]
    facility_id: Optional[uuid.UUID] = None
    unit_id: Optional[uuid.UUID] = None
    quantity: Optional[int] = None

    @model_validator(mode="after")
    def _positive_quantity(self):
        if self.quantity is not None and self.quantity < 1:
            raise ValueError("Quantity must be at least 1")
        return self


class ResourceOut(ResourceBase):
    id: uuid.UUID
    quantity: int
    occupied: int = 0
    reserved: int = 0
    out_of_service: int = 0
    available: int = 0
    facility_name: Optional[str] = None
    unit_name: Optional[str] = None

    model_config = {"from_attributes": True}


class ResourceReservationCreate(BaseModel):
    resource_id: uuid.UUID
    planned_admission_time: Optional[str] = None


class ResourceReserveRequest(BaseModel):
    """Initiate a transfer request: reserve an available resource at another
    facility for one of the requester's patients."""
    planned_admission_time: Optional[datetime] = None


class ReservationOut(BaseModel):
    id: uuid.UUID
    reserved_by: uuid.UUID
    reserved_by_name: Optional[str] = None
    planned_admission_time: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ResourceUsageOut(BaseModel):
    resource: ResourceOut
    reservations: List[ReservationOut] = []


class ResourceImportError(BaseModel):
    row: int
    message: str


class ResourceImportResult(BaseModel):
    created: int
    errors: List[ResourceImportError] = []


class DashboardActivityRow(BaseModel):
    """A reservation/transfer interaction involving a facility's resource."""
    id: uuid.UUID
    resource_name: str
    facility_name: Optional[str] = None
    unit_name: Optional[str] = None
    reserved_by_name: Optional[str] = None
    planned_admission_time: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CapacityRow(BaseModel):
    facility_id: uuid.UUID
    facility: str
    unit_type: str
    total: int
    available: int
    occupied: int
    reserved: int
    out_of_service: int
    ventilators: int = 0
    high_flow_oxygen: int = 0

    model_config = {"from_attributes": True}
