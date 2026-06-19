from __future__ import annotations
import uuid
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import hash_password
from app.core.exceptions import ConflictError, NotFoundError, ForbiddenError
from app.models.user import User, AccountStatus
from app.models.facility import Facility
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserUpdate


class UserService:
    def __init__(self, session: AsyncSession):
        self.repo = UserRepository(session)
        self.session = session

    async def create_user(self, data: UserCreate) -> User:
        existing = await self.repo.get_by_email(data.email)
        if existing:
            raise ConflictError("Email already registered", "EMAIL_EXISTS")

        existing_mid = await self.repo.get_by_medical_id(data.medical_id)
        if existing_mid:
            raise ConflictError("Medical ID already registered", "MEDICAL_ID_EXISTS")

        roles = [await self.repo.get_or_create_role(r) for r in data.roles]
        user = User(
            email=data.email,
            medical_id=data.medical_id,
            first_name=data.first_name,
            last_name=data.last_name,
            phone=data.phone,
            password_hash=hash_password(data.password),
            account_status=AccountStatus.ACTIVE.value,
            roles=roles,
        )
        return await self.repo.create(user)

    async def get_user(self, user_id: uuid.UUID) -> User:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User")
        return user

    async def list_users(self, limit: int = 100, offset: int = 0) -> List[User]:
        return await self.repo.list_all(limit=limit, offset=offset)

    async def list_users_for_facility(self, facility_id: uuid.UUID) -> List[User]:
        return await self.repo.list_by_facility(facility_id)

    async def assign_to_facility(self, medical_id: str, facility_id: uuid.UUID) -> User:
        user = await self.repo.get_by_medical_id(medical_id)
        if not user:
            raise NotFoundError("User with that medical ID")

        facility = await self.session.get(Facility, facility_id)
        if not facility:
            raise NotFoundError("Facility")

        if facility not in user.facilities:
            user.facilities.append(facility)
            await self.session.flush()
        return user

    async def set_account_status(self, user_id: uuid.UUID, status: str, acting_facility_id: uuid.UUID | None) -> User:
        user = await self.get_user(user_id)

        if acting_facility_id is not None:
            user_facility_ids = {f.id for f in user.facilities}
            if acting_facility_id not in user_facility_ids:
                raise ForbiddenError()

        user.account_status = status
        if status == AccountStatus.INACTIVE.value:
            user.is_active = False
        elif status == AccountStatus.ACTIVE.value:
            user.is_active = True
        await self.session.flush()
        return user

    async def update_user(self, user_id: uuid.UUID, data: UserUpdate) -> User:
        user = await self.get_user(user_id)
        if data.first_name is not None:
            user.first_name = data.first_name
        if data.last_name is not None:
            user.last_name = data.last_name
        if data.phone is not None:
            user.phone = data.phone
        if data.roles is not None:
            user.roles = [await self.repo.get_or_create_role(r) for r in data.roles]
        await self.session.flush()
        return user

    async def deactivate_user(self, user_id: uuid.UUID) -> None:
        user = await self.get_user(user_id)
        user.is_active = False
        user.account_status = AccountStatus.INACTIVE.value
        await self.session.flush()
