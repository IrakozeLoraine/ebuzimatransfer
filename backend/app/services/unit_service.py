from __future__ import annotations
import uuid
from typing import List, Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import NotFoundError, ValidationError
from app.core.tiers import TIER_ORDER, tier_rank
from app.models.unit import Unit
from app.models.facility import Facility
from app.models.resource import Resource
from app.schemas.unit import UnitCreate, UnitUpdate


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
