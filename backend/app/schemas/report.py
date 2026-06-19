from __future__ import annotations
from typing import Optional
from datetime import date
from pydantic import BaseModel


class ReferralReportOut(BaseModel):
    total_referrals: int
    accepted: int
    rejected: int
    cancelled: int
    en_route: int
    arrived: int
    acceptance_rate: float
    rejection_rate: float
    median_decision_minutes: Optional[float]
    avg_transport_minutes: Optional[float]


class OccupancyReportRow(BaseModel):
    facility: str
    unit_type: str
    total_resources: int
    occupied_resources: int
    occupancy_rate: float


class ReportFilter(BaseModel):
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    facility_id: Optional[str] = None
