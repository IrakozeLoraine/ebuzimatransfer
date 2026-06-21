from __future__ import annotations
import uuid
from typing import Optional
from pydantic import BaseModel, field_validator
from app.core.tiers import TIER_ORDER


def _validate_tier(value: str) -> str:
    if value not in TIER_ORDER:
        raise ValueError(f"Unknown tier '{value}'. Expected one of {list(TIER_ORDER)}.")
    return value


class UnitBase(BaseModel):
    name: str
    tier: str
    code: Optional[str] = None

    @field_validator("tier")
    @classmethod
    def _tier(cls, v: str) -> str:
        return _validate_tier(v)


class UnitCreate(UnitBase):
    pass


class UnitUpdate(BaseModel):
    name: Optional[str] = None
    tier: Optional[str] = None
    code: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("tier")
    @classmethod
    def _tier(cls, v: Optional[str]) -> Optional[str]:
        return _validate_tier(v) if v is not None else v


class UnitOut(BaseModel):
    id: uuid.UUID
    name: str
    tier: str
    code: Optional[str] = None
    is_active: bool

    model_config = {"from_attributes": True}
