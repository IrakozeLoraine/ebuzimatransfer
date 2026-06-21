"""Facility tier ordering for the cascading clinical-unit catalog.

A facility of a given tier exposes every catalog unit introduced at or below
its tier. The ordering below is structural (it mirrors the facility ``type``
values); the unit catalog itself is data managed by the super admin.
"""
from __future__ import annotations

# Lowest tier (1) to highest (4).
TIER_ORDER: dict[str, int] = {
    "HEALTH_CENTER_POST": 1,  # Tier 1 — Health Centers & Health Posts
    "DISTRICT": 2,            # Tier 2 — District Hospitals
    "LEVEL_TWO": 3,          # Tier 3 — Provincial & Referral Hospitals
    "NRH_UTH": 4,            # Tier 4 — National Referral & University Teaching Hospitals
}

TIERS: list[str] = list(TIER_ORDER.keys())


def tier_rank(tier: str | None) -> int:
    """Numeric rank for a tier; unknown tiers sort highest so they are never
    silently exposed to lower-tier facilities."""
    return TIER_ORDER.get(tier or "", 99)


def eligible(unit_tier: str | None, facility_tier: str | None) -> bool:
    """True when a unit introduced at ``unit_tier`` is available to a facility
    of ``facility_tier`` (cascading: unit tier <= facility tier)."""
    return tier_rank(unit_tier) <= tier_rank(facility_tier)
