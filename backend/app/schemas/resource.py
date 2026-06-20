from __future__ import annotations
import uuid
from typing import Optional
from pydantic import BaseModel
from app.models.resource import ResourceStatus, ResourceType


class ResourceBase(BaseModel):
    unit_id: uuid.UUID
    resource_name: str
    resource_code: str
    notes: Optional[str] = None
    resource_type: Optional[ResourceType] = None


class ResourceCreate(ResourceBase):
    quantity: int = 1
    status: ResourceStatus = ResourceStatus.AVAILABLE


class ResourceUpdate(BaseModel):
    resource_name: Optional[str] = None
    resource_code: Optional[str] = None
    notes: Optional[str] = None


class ResourceStatusUpdate(BaseModel):
    status: ResourceStatus


class ResourceOut(ResourceBase):
    id: uuid.UUID
    quantity: int
    status: Optional[ResourceStatus] = None

    model_config = {"from_attributes": True}


class ResourceReservationCreate(BaseModel):
    resource_id: uuid.UUID
    referral_id: uuid.UUID
    planned_admission_time: Optional[str] = None


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
