from __future__ import annotations
import uuid
from typing import List, Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import NotFoundError, ValidationError
from app.core.spreadsheet import read_csv_rows, read_xlsx_rows
from app.core.tiers import TIER_ORDER, tier_rank
from app.models.unit import Unit
from app.models.facility import Facility
from app.models.resource import Resource
from app.schemas.unit import UnitCreate, UnitImportError, UnitImportResult, UnitUpdate


# Accepted spreadsheet spellings for each tier, in addition to the canonical
# code itself. Keys are lower-cased; the import matches the ``tier`` cell against
# these so users can write either the code (``DISTRICT``) or a readable label.
_TIER_ALIASES: dict[str, str] = {
    "health_center_post": "HEALTH_CENTER_POST",
    "health center": "HEALTH_CENTER_POST",
    "health centers & health posts": "HEALTH_CENTER_POST",
    "health post": "HEALTH_CENTER_POST",
    "district": "DISTRICT",
    "district hospital": "DISTRICT",
    "district hospitals": "DISTRICT",
    "level_two": "LEVEL_TWO",
    "level two": "LEVEL_TWO",
    "provincial & referral hospitals": "LEVEL_TWO",
    "provincial": "LEVEL_TWO",
    "nrh_uth": "NRH_UTH",
    "national referral": "NRH_UTH",
    "national referral and university teaching hospitals": "NRH_UTH",
    "national referral / university teaching hospital": "NRH_UTH",
}


def _resolve_tier(value: str) -> Optional[str]:
    """Map a spreadsheet tier cell to a canonical tier code, or None if unknown."""
    key = value.strip().lower()
    if key in _TIER_ALIASES:
        return _TIER_ALIASES[key]
    # Also accept the canonical code in any case (e.g. "Nrh_Uth").
    for code in TIER_ORDER:
        if code.lower() == key:
            return code
    return None


class UnitService:
    """CRUD for the global, tier-scoped clinical-unit catalog."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, unit_id: uuid.UUID) -> Unit:
        unit = await self.session.get(Unit, unit_id)
        if not unit:
            raise NotFoundError("Unit")
        return unit

    async def list(
        self,
        facility_id: Optional[uuid.UUID] = None,
        active_only: bool = True,
    ) -> List[Unit]:
        """List catalog units. When ``facility_id`` is given, return only the
        units that facility's tier is eligible for (cascading: unit tier <=
        facility tier)."""
        stmt = select(Unit).order_by(Unit.tier, Unit.name)
        if active_only:
            stmt = stmt.where(Unit.is_active.is_(True))
        if facility_id is not None:
            facility = await self.session.get(Facility, facility_id)
            if not facility:
                raise NotFoundError("Facility")
            eligible = [t for t, rank in TIER_ORDER.items() if rank <= tier_rank(facility.type)]
            stmt = stmt.where(Unit.tier.in_(eligible))
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, data: UnitCreate) -> Unit:
        unit = Unit(**data.model_dump())
        self.session.add(unit)
        await self.session.flush()
        return unit

    async def update(self, unit_id: uuid.UUID, data: UnitUpdate) -> Unit:
        unit = await self.get(unit_id)
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(unit, field, value)
        await self.session.flush()
        return unit

    async def delete(self, unit_id: uuid.UUID) -> None:
        unit = await self.get(unit_id)
        count = await self.session.scalar(
            select(func.count()).select_from(Resource).where(Resource.unit_id == unit_id)
        )
        if count:
            raise ValidationError(
                "This unit has resources assigned. Deactivate it instead of deleting."
            )
        await self.session.delete(unit)
        await self.session.flush()

    async def is_eligible_for_facility(self, unit_id: uuid.UUID, facility: Facility) -> bool:
        unit = await self.get(unit_id)
        return tier_rank(unit.tier) <= tier_rank(facility.type)

    async def import_from_file(self, file_bytes: bytes, is_csv: bool = False) -> UnitImportResult:
        """Parse an .xlsx or .csv file and bulk-create catalog units.

        Expected header row (case-insensitive): ``name``, ``tier``, ``code``.
        The ``tier`` cell takes a tier code (``DISTRICT``, ``LEVEL_TWO``,
        ``NRH_UTH``, ``HEALTH_CENTER_POST``) or a readable label. Rows with an
        unknown tier, a missing name, or a name already in the catalog are
        reported as errors while the remaining valid rows still import.
        """
        rows = read_csv_rows(file_bytes) if is_csv else read_xlsx_rows(file_bytes)
        if not rows:
            return UnitImportResult(created=0, errors=[])

        header = [str(c).strip().lower() if c is not None else "" for c in rows[0]]

        def col(*names: str) -> Optional[int]:
            for name in names:
                if name in header:
                    return header.index(name)
            return None

        idx_name = col("name", "unit", "unit_name")
        idx_tier = col("tier", "facility_tier")
        idx_code = col("code")

        if idx_name is None:
            raise ValidationError("Missing required 'name' column in the spreadsheet.")
        if idx_tier is None:
            raise ValidationError("Missing required 'tier' column in the spreadsheet.")

        # Existing catalog names (active or not) so we don't create duplicates.
        existing = (await self.session.execute(select(Unit.name))).scalars().all()
        seen: set[str] = {n.strip().lower() for n in existing}

        errors: List[UnitImportError] = []
        created = 0
        for i, raw in enumerate(rows[1:], start=2):  # row 1 is the header
            def cell(idx: Optional[int]) -> Optional[str]:
                if idx is None or idx >= len(raw) or raw[idx] is None:
                    return None
                return str(raw[idx]).strip()

            name = cell(idx_name)
            if not name:
                continue  # skip blank rows silently

            if name.strip().lower() in seen:
                errors.append(UnitImportError(row=i, message=f"Unit '{name}' already exists"))
                continue

            tier_val = cell(idx_tier)
            tier = _resolve_tier(tier_val) if tier_val else None
            if tier is None:
                errors.append(
                    UnitImportError(row=i, message=f"Unknown or missing tier '{tier_val or ''}'")
                )
                continue

            self.session.add(Unit(name=name, tier=tier, code=cell(idx_code)))
            seen.add(name.strip().lower())
            created += 1

        await self.session.flush()
        return UnitImportResult(created=created, errors=errors)
