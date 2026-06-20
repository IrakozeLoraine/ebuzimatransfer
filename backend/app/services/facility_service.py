from __future__ import annotations
import uuid
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import NotFoundError
from app.models.facility import Facility
from app.models.unit import Unit, Resource
from app.repositories.facility_repository import FacilityRepository, UnitRepository
from app.schemas.facility import FacilityCreate, FacilityUpdate, UnitCreate, UnitUpdate


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

    async def delete(self, facility_id: uuid.UUID) -> None:
        f = await self.get(facility_id)
        f.is_active = False
        await self.session.flush()


class UnitService:
    def __init__(self, session: AsyncSession):
        self.repo = UnitRepository(session)
        self.session = session

    async def create(self, data: UnitCreate) -> Unit:
        unit = Unit(**data.model_dump())
        return await self.repo.create(unit)

    async def get(self, unit_id: uuid.UUID) -> Unit:
        u = await self.repo.get_by_id(unit_id)
        if not u:
            raise NotFoundError("Unit")
        return u

    async def update(self, unit_id: uuid.UUID, data: UnitUpdate) -> Unit:
        unit = await self.get(unit_id)
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(unit, field, value)
        await self.session.flush()
        return unit

    async def delete(self, unit_id: uuid.UUID) -> None:
        unit = await self.get(unit_id)
        await self.repo.delete(unit)

    async def set_resource(self, unit_id: uuid.UUID, resource_type: str, quantity: int) -> Resource:
        unit = await self.get(unit_id)
        fac_repo = FacilityRepository(self.session)
        resource = await self.repo.get_resource(unit_id, resource_type)
        if resource:
            resource.quantity = quantity
        else:
            resource = Resource(unit_id=unit_id, resource_type=resource_type, quantity=quantity)
            self.session.add(resource)
        await self.session.flush()
        return resource
