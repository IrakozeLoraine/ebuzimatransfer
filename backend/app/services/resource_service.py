from __future__ import annotations
import uuid
from typing import List, Optional, Sequence
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import NotFoundError, ResourceReservedError, ValidationError
from app.core.spreadsheet import read_csv_rows, read_xlsx_rows
from app.core.tiers import tier_rank
from app.models.resource import Resource, ResourceStatus, ResourceType, ResourceReservation
from app.models.unit import Unit
from app.models.facility import Facility
from app.repositories.resource_repository import ResourceRepository
from app.schemas.resource import (
    ResourceCreate,
    ResourceCountsUpdate,
    ResourceOut,
    ReservationOut,
    ResourceUsageOut,
    ResourceImportResult,
    ResourceImportError,
    CapacityRow,
    DashboardActivityRow,
)


def _to_out(resource: Resource) -> ResourceOut:
    return ResourceOut(
        id=resource.id,
        resource_name=resource.resource_name,
        resource_code=resource.resource_code,
        notes=resource.notes,
        resource_type=resource.resource_type,
        unit_id=resource.unit_id,
        facility_id=resource.facility_id,
        quantity=resource.quantity,
        occupied=resource.occupied,
        reserved=resource.reserved,
        out_of_service=resource.out_of_service,
        available=resource.available,
        facility_name=resource.facility.name if resource.facility else None,
        unit_name=resource.unit.name if resource.unit else None,
    )


# Map of accepted resource_type values (case-insensitive) -> enum
_RESOURCE_TYPE_BY_VALUE = {t.value.lower(): t for t in ResourceType}


class ResourceService:
    def __init__(self, session: AsyncSession):
        self.repo = ResourceRepository(session)
        self.session = session

    async def _get_unit(self, unit_id: uuid.UUID) -> Unit:
        result = await self.session.execute(select(Unit).where(Unit.id == unit_id))
        unit = result.scalar_one_or_none()
        if not unit:
            raise NotFoundError("Unit")
        return unit

    async def _validate_unit_facility(
        self, unit_id: uuid.UUID | None, facility_id: uuid.UUID | None
    ) -> None:
        """A clinical unit may only be attached to a facility whose tier is at
        or above the unit's tier (cascading catalog)."""
        if unit_id is None or facility_id is None:
            return
        unit = await self._get_unit(unit_id)
        facility = await self.session.get(Facility, facility_id)
        if not facility:
            raise NotFoundError("Facility")
        if tier_rank(unit.tier) > tier_rank(facility.type):
            raise ValidationError("This unit is not available at the selected facility's tier")

    async def create(self, data: ResourceCreate) -> Resource:
        payload = data.model_dump()
        await self._validate_unit_facility(payload.get("unit_id"), payload.get("facility_id"))
        resource = Resource(**payload)
        # Central stock (no facility/unit) is out of circulation until assigned;
        # everything else starts fully available.
        if resource.facility_id is None and resource.unit_id is None:
            resource.out_of_service = resource.quantity
        return await self.repo.create(resource)

    async def get(self, resource_id: uuid.UUID) -> Resource:
        resource = await self.repo.get_by_id(resource_id)
        if not resource:
            raise NotFoundError("Resource")
        return resource

    async def list_scoped(
        self,
        facility_ids: Optional[Sequence[uuid.UUID]] = None,
        facility_id: Optional[uuid.UUID] = None,
        unassigned: bool = False,
        status: Optional[ResourceStatus] = None,
    ) -> List[ResourceOut]:
        resources = await self.repo.list_scoped(
            facility_ids=facility_ids, facility_id=facility_id, unassigned=unassigned, status=status
        )
        return [_to_out(r) for r in resources]

    async def list_available(self, unit_id: uuid.UUID | None = None) -> List[ResourceOut]:
        resources = await self.repo.list_available(unit_id=unit_id)
        return [_to_out(r) for r in resources]

    async def add_units(self, resource_id: uuid.UUID, count: int) -> ResourceOut:
        """Add ``count`` units to an existing resource group. Units added to a
        facility/unit are immediately available; units added to central stock are
        held out of circulation (out-of-service) until assigned, matching how
        stock is created."""
        if count < 1:
            raise ValidationError("Count must be at least 1")
        resource = await self.get(resource_id)
        resource.quantity += count
        if resource.facility_id is None and resource.unit_id is None:
            resource.out_of_service += count
        # Elsewhere the new units fall into the derived AVAILABLE pool.
        await self.session.flush()
        result = await self.session.execute(
            select(Resource)
            .where(Resource.id == resource_id)
            .options(selectinload(Resource.unit), selectinload(Resource.facility))
        )
        return _to_out(result.scalar_one())

    async def remove_units(self, resource_id: uuid.UUID, count: int) -> ResourceOut:
        """Remove ``count`` units from a resource group. Only out-of-service units
        may be removed — in-use (available/occupied/reserved) units stay put. A
        group emptied to zero is deleted."""
        if count < 1:
            raise ValidationError("Count must be at least 1")
        result = await self.session.execute(
            select(Resource)
            .where(Resource.id == resource_id)
            .options(selectinload(Resource.unit), selectinload(Resource.facility))
        )
        resource = result.scalar_one_or_none()
        if not resource:
            raise NotFoundError("Resource")
        if count > resource.out_of_service:
            raise ValidationError(
                f"Only {resource.out_of_service} out-of-service unit(s) can be removed"
            )
        resource.quantity -= count
        resource.out_of_service -= count
        out = _to_out(resource)
        if resource.quantity <= 0:
            await self.session.delete(resource)
        await self.session.flush()
        return out

    async def update_counts(self, resource_id: uuid.UUID, data: ResourceCountsUpdate) -> Resource:
        """Set the per-status unit counts for a resource group. AVAILABLE is the
        remainder, so the supplied counts may not exceed the group's quantity."""
        resource = await self.get(resource_id)
        if data.occupied + data.reserved + data.out_of_service > resource.quantity:
            raise ValidationError(
                f"Occupied, reserved and out-of-service units cannot exceed the quantity ({resource.quantity})"
            )
        resource.occupied = data.occupied
        resource.reserved = data.reserved
        resource.out_of_service = data.out_of_service
        await self.session.flush()
        return resource

    @staticmethod
    def _movable(resource: Resource) -> int:
        """How many of a group's units can be (re-)assigned right now. Central
        stock (no facility/unit) is held entirely out of circulation, so all of
        it is movable; anywhere else only the AVAILABLE units may be moved —
        occupied/reserved/out-of-service units stay put with their group."""
        if resource.facility_id is None and resource.unit_id is None:
            return resource.quantity
        return resource.available

    async def _find_merge_target(
        self,
        source: Resource,
        facility_id: uuid.UUID | None,
        unit_id: uuid.UUID | None,
    ) -> Resource | None:
        """An existing, identical resource group already at the destination, into
        which split-off units should be merged (same name, code and type)."""

        def eq(col, val):
            return col.is_(None) if val is None else col == val

        result = await self.session.execute(
            select(Resource).where(
                Resource.id != source.id,
                eq(Resource.facility_id, facility_id),
                eq(Resource.unit_id, unit_id),
                Resource.resource_name == source.resource_name,
                eq(Resource.resource_code, source.resource_code),
                eq(Resource.resource_type, source.resource_type),
            )
        )
        return result.scalars().first()

    async def assign(
        self,
        resource_id: uuid.UUID,
        facility_id: uuid.UUID | None,
        unit_id: uuid.UUID | None,
        quantity: int | None = None,
    ) -> ResourceOut | None:
        """Move ``quantity`` units of a resource group to a facility/unit (or back
        to central stock when both are null). ``quantity`` is clamped to what's
        movable; ``None`` moves everything movable. The moved units are split off
        the source and merged into an identical group at the destination if one
        exists, otherwise they form a new group. Returns ``None`` when the source
        has nothing movable (so bulk callers can skip it)."""
        resource = await self.get(resource_id)
        if unit_id is not None:
            # A clinical unit only exists in the context of a facility.
            if facility_id is None:
                raise ValidationError("A facility is required when assigning a unit")
            await self._validate_unit_facility(unit_id, facility_id)

        movable = self._movable(resource)
        qty = movable if quantity is None else min(quantity, movable)
        if qty < 1:
            return None

        dest_is_stock = facility_id is None and unit_id is None
        source_is_stock = resource.facility_id is None and resource.unit_id is None
        target = await self._find_merge_target(resource, facility_id, unit_id)

        if qty == resource.quantity and target is None:
            # Whole group relocating with nothing to merge into: relabel in place
            # so the row (and any reservations on it) keeps its identity.
            resource.facility_id = facility_id
            resource.unit_id = unit_id
            resource.occupied = 0
            resource.reserved = 0
            # Central stock is held out of circulation until re-assigned.
            resource.out_of_service = resource.quantity if dest_is_stock else 0
            moved = resource
        else:
            # Split: take qty units off the source group.
            resource.quantity -= qty
            if source_is_stock:
                # The moved units came from the out-of-service stock pool.
                resource.out_of_service = max(0, resource.out_of_service - qty)
            # Elsewhere the units came from the (derived) AVAILABLE pool, so the
            # remaining counts are already correct.

            if target is not None:
                target.quantity += qty
                if dest_is_stock:
                    target.out_of_service += qty
                moved = target
            else:
                moved = Resource(
                    resource_name=resource.resource_name,
                    resource_code=resource.resource_code,
                    resource_type=resource.resource_type,
                    notes=resource.notes,
                    quantity=qty,
                    facility_id=facility_id,
                    unit_id=unit_id,
                    out_of_service=qty if dest_is_stock else 0,
                )
                self.session.add(moved)

            if resource.quantity <= 0:
                # The whole group was merged away — drop the emptied source row.
                await self.session.delete(resource)

        await self.session.flush()
        # Reload with relationships for display.
        result = await self.session.execute(
            select(Resource)
            .where(Resource.id == moved.id)
            .options(selectinload(Resource.unit), selectinload(Resource.facility))
        )
        return _to_out(result.scalar_one())

    async def usage(self, resource_id: uuid.UUID) -> ResourceUsageOut:
        result = await self.session.execute(
            select(Resource)
            .where(Resource.id == resource_id)
            .options(selectinload(Resource.unit), selectinload(Resource.facility))
        )
        resource = result.scalar_one_or_none()
        if not resource:
            raise NotFoundError("Resource")
        rows = await self.repo.reservations_for(resource_id)
        reservations = [
            ReservationOut(
                id=res.id,
                reserved_by=res.reserved_by,
                reserved_by_name=user.full_name,
                planned_admission_time=res.planned_admission_time,
                created_at=res.created_at,
            )
            for res, user in rows
        ]
        return ResourceUsageOut(resource=_to_out(resource), reservations=reservations)

    async def import_from_excel(
        self,
        file_bytes: bytes,
        default_facility_id: uuid.UUID | None = None,
        is_csv: bool = False,
    ) -> ResourceImportResult:
        """Parse an .xlsx or .csv file and bulk-create resources.

        Expected header row (case-insensitive): resource_name, resource_code,
        resource_type, quantity, unit, notes. The ``unit`` column holds the
        clinical unit's *name*; it is resolved against the units available at
        the target facility's tier. Rows whose unit name is unknown (or not
        available at this facility) are reported as errors while the remaining
        valid rows are still imported.
        """
        rows = read_csv_rows(file_bytes) if is_csv else read_xlsx_rows(file_bytes)
        if not rows:
            return ResourceImportResult(created=0, errors=[])

        header = [str(c).strip().lower() if c is not None else "" for c in rows[0]]

        def col(*names: str) -> Optional[int]:
            for name in names:
                if name in header:
                    return header.index(name)
            return None

        idx_name = col("resource_name")
        idx_code = col("resource_code")
        idx_type = col("resource_type")
        idx_qty = col("quantity")
        idx_unit = col("unit", "unit_name")
        idx_notes = col("notes")

        errors: List[ResourceImportError] = []
        if idx_name is None:
            raise ValidationError("Missing required 'resource_name' column in the spreadsheet.")

        created = 0

        # Resolve the target facility's tier so we can scope unit names to the
        # units actually available at that facility (cascading catalog). When no
        # facility is given (super-admin central stock), names resolve against the
        # full active catalog.
        facility_tier: str | None = None
        if default_facility_id is not None:
            facility = await self.session.get(Facility, default_facility_id)
            facility_tier = facility.type if facility else None

        # Build a case-insensitive name -> Unit lookup of the units available for
        # this import, computed once.
        active_units = (
            (await self.session.execute(select(Unit).where(Unit.is_active.is_(True))))
            .scalars()
            .all()
        )
        units_by_name: dict[str, Unit] = {}
        for u in active_units:
            if facility_tier is not None and tier_rank(u.tier) > tier_rank(facility_tier):
                continue  # not available at this facility's tier
            units_by_name.setdefault(u.name.strip().lower(), u)

        for i, raw in enumerate(rows[1:], start=2):  # row 1 is the header
            def cell(idx: Optional[int]) -> Optional[str]:
                if idx is None or idx >= len(raw) or raw[idx] is None:
                    return None
                return str(raw[idx]).strip()

            name = cell(idx_name)
            if not name:
                continue  # skip blank rows silently

            resource_type = None
            type_val = cell(idx_type)
            if type_val:
                resource_type = _RESOURCE_TYPE_BY_VALUE.get(type_val.lower())
                if resource_type is None:
                    errors.append(ResourceImportError(row=i, message=f"Unknown resource_type '{type_val}'"))
                    continue

            quantity = 1
            qty_val = cell(idx_qty)
            if qty_val:
                try:
                    quantity = int(float(qty_val))
                except ValueError:
                    errors.append(ResourceImportError(row=i, message=f"Invalid quantity '{qty_val}'"))
                    continue
                if quantity < 1:
                    errors.append(ResourceImportError(row=i, message="Quantity must be at least 1"))
                    continue

            facility_id = default_facility_id
            unit_id: uuid.UUID | None = None
            unit_raw = cell(idx_unit)
            if unit_raw:
                unit = units_by_name.get(unit_raw.strip().lower())
                if not unit:
                    errors.append(
                        ResourceImportError(
                            row=i,
                            message=f"Unit '{unit_raw}' is not available at this facility",
                        )
                    )
                    continue
                unit_id = unit.id
                # facility_id stays the import target (central stock when None).

            self.session.add(
                Resource(
                    resource_name=name,
                    resource_code=cell(idx_code),
                    resource_type=resource_type,
                    quantity=quantity,
                    notes=cell(idx_notes),
                    unit_id=unit_id,
                    facility_id=facility_id,
                )
            )
            created += 1

        await self.session.flush()
        return ResourceImportResult(created=created, errors=errors)

    async def reserve(
        self,
        resource_id: uuid.UUID,
        reserved_by: uuid.UUID,
        planned_admission_time: datetime | None = None,
        referral_id: uuid.UUID | None = None,
    ) -> ResourceReservation:
        """Atomically reserve a resource using SELECT FOR UPDATE. Optionally links
        the reservation to the transfer request (referral) it fulfils."""
        resource = await self.repo.lock_for_update(resource_id)
        if not resource or resource.available < 1:
            raise ResourceReservedError()

        # Hold one unit of the group for the incoming patient.
        resource.reserved += 1
        reservation = ResourceReservation(
            resource_id=resource_id,
            reserved_by=reserved_by,
            planned_admission_time=planned_admission_time,
            referral_id=referral_id,
        )
        self.session.add(reservation)

        await self.session.flush()
        return reservation

    async def capacity_dashboard(
        self, facility_ids: Optional[Sequence[uuid.UUID]] = None
    ) -> List[CapacityRow]:
        rows = await self.repo.capacity_summary_raw(facility_ids=facility_ids)
        result = []
        for r in rows:
            result.append(CapacityRow(
                facility_id=r["facility_id"],
                facility=r["facility"],
                unit_type=r["unit_type"],
                total=r["total"] or 0,
                available=r["available"] or 0,
                occupied=r["occupied"] or 0,
                reserved=r["reserved"] or 0,
                out_of_service=r["out_of_service"] or 0,
            ))
        return result

    async def recent_activity(
        self, facility_ids: Optional[Sequence[uuid.UUID]] = None, limit: int = 20
    ) -> List[DashboardActivityRow]:
        rows = await self.repo.recent_reservations(facility_ids=facility_ids, limit=limit)
        result = []
        for r in rows:
            name = f"{r['first_name']} {r['last_name']}".strip() or None
            result.append(DashboardActivityRow(
                id=r["id"],
                resource_name=r["resource_name"],
                facility_name=r["facility_name"],
                unit_name=r["unit_name"],
                reserved_by_name=name,
                planned_admission_time=r["planned_admission_time"],
                created_at=r["created_at"],
            ))
        return result
