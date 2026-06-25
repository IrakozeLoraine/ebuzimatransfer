from __future__ import annotations
import uuid
from typing import Optional, List
from pydantic import BaseModel


class FacilityBase(BaseModel):
    name: str
    type: str
    location: Optional[str] = None
    province: Optional[str] = None
    district: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class FacilityCreate(FacilityBase):
    pass


class FacilityUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    location: Optional[str] = None
    province: Optional[str] = None
    district: Optional[str] = None
    is_active: Optional[bool] = None


class FacilityOut(FacilityBase):
    id: uuid.UUID
    is_active: bool

    model_config = {"from_attributes": True}


class FacilityImportError(BaseModel):
    row: int
    message: str


class FacilityImportResult(BaseModel):
    created: int
    errors: List[FacilityImportError] = []
