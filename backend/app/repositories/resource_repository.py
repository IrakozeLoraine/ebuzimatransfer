from __future__ import annotations
import uuid
from typing import List, Optional, Sequence
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.resource import Resource, ResourceStatus, ResourceReservation
from app.models.unit import Unit
from app.models.facility import Facility
from app.models.user import User
from app.repositories.base import BaseRepository


class ResourceRepository(BaseRepository[Resource]):
    def __init__(self, session: AsyncSession):
        super().__init__(Resource, session)

    async def lock_for_update(self, resource_id: uuid.UUID) -> Optional[Resource]:
        result = await self.session.execute(
            select(Resource).where(Resource.id == resource_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def list_scoped(
        self,
        facility_ids: Optional[Sequence[uuid.UUID]] = None,
        facility_id: Optional[uuid.UUID] = None,
        unassigned: bool = False,
        status: Optional[ResourceStatus] = None,
    ) -> List[Resource]:
        """List resources with optional role/facility scoping.

        - ``facility_ids``: restrict to resources belonging to these facilities
          (used to scope a facility admin to their own facilities).
        - ``facility_id``: filter to a single facility.
        - ``unassigned``: only central stock not assigned to any facility.
        - ``status``: filter by resource status.
        """
        stmt = (
            select(Resource)
            .options(selectinload(Resource.unit), selectinload(Resource.facility))
            .order_by(Resource.resource_name)
        )
        if unassigned:
            stmt = stmt.where(Resource.facility_id.is_(None))
        if facility_id is not None:
            stmt = stmt.where(Resource.facility_id == facility_id)
        if facility_ids is not None:
            stmt = stmt.where(Resource.facility_id.in_(list(facility_ids)))
        if status is not None:
            stmt = stmt.where(Resource.status == status)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_available(self, unit_id: Optional[uuid.UUID] = None) -> List[Resource]:
        """Available resources that belong to a facility, across all facilities
        (for the inter-facility transfer search). Optionally filtered by unit."""
        stmt = (
            select(Resource)
            .options(selectinload(Resource.unit), selectinload(Resource.facility))
            .where(Resource.status == ResourceStatus.AVAILABLE, Resource.facility_id.isnot(None))
            .order_by(Resource.resource_name)
        )
        if unit_id is not None:
            stmt = stmt.where(Resource.unit_id == unit_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def reservations_for(self, resource_id: uuid.UUID) -> List[tuple[ResourceReservation, User]]:
        result = await self.session.execute(
            select(ResourceReservation, User)
            .join(User, ResourceReservation.reserved_by == User.id)
            .where(ResourceReservation.resource_id == resource_id)
            .order_by(ResourceReservation.created_at.desc())
        )
        return [(row[0], row[1]) for row in result.all()]

    async def capacity_summary_raw(
        self, facility_ids: Optional[Sequence[uuid.UUID]] = None
    ) -> List[dict]:
        """Aggregate assigned resources by facility + clinical unit with per-status
        counts. ``facility_ids`` restricts the summary to those facilities (used to
        scope a facility admin to their own facility)."""
        s = ResourceStatus
        stmt = (
            select(
                Facility.id.label("facility_id"),
                Facility.name.label("facility"),
                Unit.name.label("unit_type"),
                func.coalesce(func.sum(Resource.quantity), 0).label("total"),
                func.coalesce(
                    func.sum(Resource.quantity).filter(Resource.status == s.AVAILABLE), 0
                ).label("available"),
                func.coalesce(
                    func.sum(Resource.quantity).filter(Resource.status == s.OCCUPIED), 0
                ).label("occupied"),
                func.coalesce(
                    func.sum(Resource.quantity).filter(Resource.status == s.RESERVED), 0
                ).label("reserved"),
                func.coalesce(
                    func.sum(Resource.quantity).filter(Resource.status == s.OUT_OF_SERVICE), 0
                ).label("out_of_service"),
            )
            .join(Unit, Resource.unit_id == Unit.id)
            .join(Facility, Resource.facility_id == Facility.id)
            .group_by(Facility.id, Facility.name, Unit.name)
            .order_by(Facility.name, Unit.name)
        )
        if facility_ids is not None:
            stmt = stmt.where(Resource.facility_id.in_(list(facility_ids)))
        result = await self.session.execute(stmt)
        return [dict(row._mapping) for row in result.all()]

    async def recent_reservations(
        self, facility_ids: Optional[Sequence[uuid.UUID]] = None, limit: int = 20
    ) -> List[dict]:
        """Recent reservation/transfer interactions, newest first. ``facility_ids``
        restricts to interactions on resources owned by those facilities."""
        stmt = (
            select(
                ResourceReservation.id.label("id"),
                ResourceReservation.created_at.label("created_at"),
                ResourceReservation.planned_admission_time.label("planned_admission_time"),
                Resource.resource_name.label("resource_name"),
                Facility.name.label("facility_name"),
                Unit.name.label("unit_name"),
                User.first_name.label("first_name"),
                User.last_name.label("last_name"),
            )
            .join(Resource, ResourceReservation.resource_id == Resource.id)
            .join(User, ResourceReservation.reserved_by == User.id)
            .outerjoin(Facility, Resource.facility_id == Facility.id)
            .outerjoin(Unit, Resource.unit_id == Unit.id)
            .order_by(ResourceReservation.created_at.desc())
            .limit(limit)
        )
        if facility_ids is not None:
            stmt = stmt.where(Resource.facility_id.in_(list(facility_ids)))
        result = await self.session.execute(stmt)
        return [dict(row._mapping) for row in result.all()]
