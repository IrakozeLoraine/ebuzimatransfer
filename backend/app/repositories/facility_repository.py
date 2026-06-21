from __future__ import annotations
import uuid
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.facility import Facility
from app.models.unit import Unit, Resource
from app.repositories.base import BaseRepository


class FacilityRepository(BaseRepository[Facility]):
    def __init__(self, session: AsyncSession):
        super().__init__(Facility, session)

    async def list_active(self) -> List[Facility]:
        result = await self.session.execute(
            select(Facility).where(Facility.is_active == True)
        )
        return list(result.scalars().all())

    async def get_units_by_facility(self, facility_id: uuid.UUID) -> List[Unit]:
        result = await self.session.execute(
            select(Unit).where(Unit.facility_id == facility_id).options(selectinload(Unit.resources))
        )
        return list(result.scalars().all())


class UnitRepository(BaseRepository[Unit]):
    def __init__(self, session: AsyncSession):
        super().__init__(Unit, session)

    async def get_with_resources(self, unit_id: uuid.UUID) -> Optional[Unit]:
        result = await self.session.execute(
            select(Unit).where(Unit.id == unit_id).options(selectinload(Unit.resources))
        )
        return result.scalar_one_or_none()

    async def get_resource(self, unit_id: uuid.UUID, resource_type: str) -> Optional[Resource]:
        result = await self.session.execute(
            select(Resource).where(Resource.unit_id == unit_id, Resource.resource_type == resource_type)
        )
        return result.scalar_one_or_none()
