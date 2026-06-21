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

    async def reservations_for(self, resource_id: uuid.UUID) -> List[tuple[ResourceReservation, User]]:
        result = await self.session.execute(
            select(ResourceReservation, User)
            .join(User, ResourceReservation.reserved_by == User.id)
            .where(ResourceReservation.resource_id == resource_id)
            .order_by(ResourceReservation.created_at.desc())
        )
        return [(row[0], row[1]) for row in result.all()]

    async def capacity_summary_raw(self) -> List[dict]:
        """Aggregate assigned resources by facility + unit type with per-status counts."""
        s = ResourceStatus
        stmt = (
            select(
                Facility.id.label("facility_id"),
                Facility.name.label("facility"),
                Unit.type.label("unit_type"),
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
            .join(Facility, Unit.facility_id == Facility.id)
            .group_by(Facility.id, Facility.name, Unit.type)
            .order_by(Facility.name, Unit.type)
        )
        result = await self.session.execute(stmt)
        return [dict(row._mapping) for row in result.all()]
