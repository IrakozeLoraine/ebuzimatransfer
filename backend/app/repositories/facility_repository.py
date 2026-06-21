from __future__ import annotations
from typing import List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.facility import Facility
from app.repositories.base import BaseRepository


class FacilityRepository(BaseRepository[Facility]):
    def __init__(self, session: AsyncSession):
        super().__init__(Facility, session)

    async def list_active(self) -> List[Facility]:
        result = await self.session.execute(
            select(Facility).where(Facility.is_active == True)
        )
        return list(result.scalars().all())
