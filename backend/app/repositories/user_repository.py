from __future__ import annotations
import uuid
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User, Role, UserFacilityRole
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    def __init__(self, session: AsyncSession):
        super().__init__(User, session)

    def _with_relations(self):
        return [
            selectinload(User.facility_roles).joinedload(UserFacilityRole.role),
            selectinload(User.facility_roles).joinedload(UserFacilityRole.facility),
        ]

    async def get_by_id(self, id: uuid.UUID) -> Optional[User]:
        result = await self.session.execute(
            select(User).where(User.id == id).options(*self._with_relations())
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.session.execute(
            select(User).where(User.email == email).options(*self._with_relations())
        )
        return result.scalar_one_or_none()

    async def get_by_medical_id(self, medical_id: str) -> Optional[User]:
        result = await self.session.execute(
            select(User).where(User.medical_id == medical_id).options(*self._with_relations())
        )
        return result.scalar_one_or_none()

    async def list_all(self, limit: int = 100, offset: int = 0) -> List[User]:
        result = await self.session.execute(
            select(User).options(*self._with_relations()).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_facility(self, facility_id: uuid.UUID) -> List[User]:
        result = await self.session.execute(
            select(User)
            .join(UserFacilityRole, UserFacilityRole.user_id == User.id)
            .where(UserFacilityRole.facility_id == facility_id)
            .distinct()
            .options(*self._with_relations())
        )
        return list(result.scalars().all())

    async def get_role_by_name(self, name: str) -> Optional[Role]:
        result = await self.session.execute(select(Role).where(Role.name == name))
        return result.scalar_one_or_none()

    async def get_or_create_role(self, name: str) -> Role:
        role = await self.get_role_by_name(name)
        if not role:
            role = Role(name=name)
            self.session.add(role)
            await self.session.flush()
        return role
