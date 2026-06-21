from __future__ import annotations
import uuid
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import NotFoundError
from app.models.facility import Facility
from app.repositories.facility_repository import FacilityRepository
from app.schemas.facility import FacilityCreate, FacilityUpdate


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
