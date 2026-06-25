from __future__ import annotations
import uuid
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import NotFoundError, ValidationError
from app.core.spreadsheet import read_csv_rows, read_xlsx_rows
from app.core.tiers import TIER_ORDER
from app.models.facility import Facility
from app.repositories.facility_repository import FacilityRepository
from app.schemas.facility import (
    FacilityCreate,
    FacilityImportError,
    FacilityImportResult,
    FacilityUpdate,
)


# Accepted spreadsheet spellings for each facility type, in addition to the
# canonical code itself. Keys are lower-cased; the import matches the ``type``
# cell against these so users can write either the code (``DISTRICT``) or a
# readable label.
_TYPE_ALIASES: dict[str, str] = {
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


def _resolve_type(value: str) -> Optional[str]:
    """Map a spreadsheet type cell to a canonical facility-type code, or None."""
    key = value.strip().lower()
    if key in _TYPE_ALIASES:
        return _TYPE_ALIASES[key]
    for code in TIER_ORDER:
        if code.lower() == key:
            return code
    return None


class FacilityService:
    def __init__(self, session: AsyncSession):
        self.repo = FacilityRepository(session)
        self.session = session

    async def create(self, data: FacilityCreate) -> Facility:
        facility = Facility(**data.model_dump())
        return await self.repo.create(facility)

    async def list_all(self) -> List[Facility]:
        return await self.repo.list_all()

    async def get(self, facility_id: uuid.UUID) -> Facility:
        f = await self.repo.get_by_id(facility_id)
        if not f:
            raise NotFoundError("Facility")
        return f

    async def update(self, facility_id: uuid.UUID, data: FacilityUpdate) -> Facility:
        f = await self.get(facility_id)
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(f, field, value)
        await self.session.flush()
        return f

    async def set_location(self, facility_id: uuid.UUID, latitude: float, longitude: float) -> Facility:
        f = await self.get(facility_id)
        f.latitude = latitude
        f.longitude = longitude
        await self.session.flush()
        return f

    async def delete(self, facility_id: uuid.UUID) -> None:
        f = await self.get(facility_id)
        f.is_active = False
        await self.session.flush()

    async def import_from_file(self, file_bytes: bytes, is_csv: bool = False) -> FacilityImportResult:
        """Parse an .xlsx or .csv file and bulk-create facilities.

        Expected header row (case-insensitive): ``name``, ``type``,
        ``location``, ``province``, ``district``. The ``type`` cell takes a
        facility-type code (``DISTRICT``, ``LEVEL_TWO``, ``NRH_UTH``,
        ``HEALTH_CENTER_POST``) or a readable label. Rows with an unknown type,
        a missing name, or a name already in the catalog are reported as errors
        while the remaining valid rows still import.
        """
        rows = read_csv_rows(file_bytes) if is_csv else read_xlsx_rows(file_bytes)
        if not rows:
            return FacilityImportResult(created=0, errors=[])

        def norm(cell) -> str:
            # Strip a leading BOM, surrounding quotes/whitespace that Excel may
            # add when re-saving, then lowercase for matching.
            if cell is None:
                return ""
            return str(cell).lstrip("﻿").strip().strip('"').strip().lower()

        # The header isn't always the first row — spreadsheets often carry a
        # leading blank or title row. Find the first non-empty row and treat it
        # as the header so data below it lines up.
        header_idx = next(
            (n for n, r in enumerate(rows) if any(norm(c) for c in r)),
            None,
        )
        if header_idx is None:
            return FacilityImportResult(created=0, errors=[])

        header = [norm(c) for c in rows[header_idx]]

        def col(*names: str) -> Optional[int]:
            for name in names:
                if name in header:
                    return header.index(name)
            return None

        idx_name = col("name", "facility", "facility_name")
        idx_type = col("type", "facility_type", "tier")
        idx_location = col("location")
        idx_province = col("province")
        idx_district = col("district")

        detected = ", ".join(h for h in header if h) or "(none)"
        if idx_name is None:
            raise ValidationError(
                f"Missing required 'name' column. Detected columns: {detected}."
            )
        if idx_type is None:
            raise ValidationError(
                f"Missing required 'type' column. Detected columns: {detected}."
            )

        # Existing facility names (active or not) so we don't create duplicates.
        existing = (await self.session.execute(select(Facility.name))).scalars().all()
        seen: set[str] = {n.strip().lower() for n in existing}

        errors: List[FacilityImportError] = []
        created = 0
        for i, raw in enumerate(rows[header_idx + 1 :], start=header_idx + 2):
            def cell(idx: Optional[int]) -> Optional[str]:
                if idx is None or idx >= len(raw) or raw[idx] is None:
                    return None
                return str(raw[idx]).strip()

            name = cell(idx_name)
            if not name:
                continue  # skip blank rows silently

            if name.strip().lower() in seen:
                errors.append(FacilityImportError(row=i, message=f"Facility '{name}' already exists"))
                continue

            type_val = cell(idx_type)
            ftype = _resolve_type(type_val) if type_val else None
            if ftype is None:
                errors.append(
                    FacilityImportError(row=i, message=f"Unknown or missing type '{type_val or ''}'")
                )
                continue

            self.session.add(
                Facility(
                    name=name,
                    type=ftype,
                    location=cell(idx_location),
                    province=cell(idx_province),
                    district=cell(idx_district),
                )
            )
            seen.add(name.strip().lower())
            created += 1

        await self.session.flush()
        return FacilityImportResult(created=created, errors=errors)
