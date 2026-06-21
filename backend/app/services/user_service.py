from __future__ import annotations
import uuid
import secrets
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import hash_password
from app.core.exceptions import ConflictError, NotFoundError, ForbiddenError
from app.models.user import User, AccountStatus, UserFacilityRole
from app.models.facility import Facility
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserUpdate


class UserService:
    def __init__(self, session: AsyncSession):
        self.repo = UserRepository(session)
        self.session = session

    async def create_user(self, data: UserCreate) -> User:
        if data.email:
            existing = await self.repo.get_by_email(data.email)
            if existing:
                raise ConflictError("Email already registered", "EMAIL_EXISTS")

        existing_mid = await self.repo.get_by_medical_id(data.medical_id)
        if existing_mid:
            raise ConflictError("Medical ID already registered", "MEDICAL_ID_EXISTS")

        # Identity only — roles are granted per-facility afterwards via assign_roles.
        # New accounts have no admin-set password: they start in PASSWORD_RESET_ENABLED
        # and the user sets their own password on first login. The placeholder hash is
        # a random secret so the account can never be logged into until that happens.
        user = User(
            email=data.email,
            medical_id=data.medical_id,
            first_name=data.first_name,
            last_name=data.last_name,
            phone=data.phone,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            account_status=AccountStatus.PASSWORD_RESET_ENABLED.value,
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

    async def assign_roles(self, medical_id: str, facility_id: uuid.UUID, roles: List[str]) -> User:
        """Grant the given roles to a user at a facility, replacing that facility's existing grants."""
        user = await self.repo.get_by_medical_id(medical_id)
        if not user:
            raise NotFoundError("User with that medical ID")

        facility = await self.session.get(Facility, facility_id)
        if not facility:
            raise NotFoundError("Facility")

        # Drop the user's current grants for this facility, then re-add the requested ones.
        user.facility_roles = [fr for fr in user.facility_roles if fr.facility_id != facility_id]
        for role_name in dict.fromkeys(roles):
            role = await self.repo.get_or_create_role(role_name)
            # Populate the role/facility relationships in-memory so serialization
            # does not trigger an async lazy-load on the freshly-created grant.
            user.facility_roles.append(
                UserFacilityRole(facility=facility, role=role)
            )
        await self.session.flush()
        return user

    async def create_and_assign(self, data: UserCreate, facility_id: uuid.UUID, roles: List[str]) -> User:
        """Create a new identity, then grant the given roles at the facility."""
        user = await self.create_user(data)
        return await self.assign_roles(user.medical_id, facility_id, roles)

    async def remove_from_facility(self, user_id: uuid.UUID, facility_id: uuid.UUID) -> User:
        user = await self.get_user(user_id)
        user.facility_roles = [fr for fr in user.facility_roles if fr.facility_id != facility_id]
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

    async def update_user(self, user_id: uuid.UUID, data: UserUpdate, acting_facility_id: uuid.UUID | None = None) -> User:
        user = await self.get_user(user_id)

        # Facility admins may only edit users who belong to their own facility.
        if acting_facility_id is not None:
            if acting_facility_id not in {f.id for f in user.facilities}:
                raise ForbiddenError()

        fields_set = data.model_fields_set
        if "email" in fields_set:
            if data.email and data.email != user.email:
                existing = await self.repo.get_by_email(data.email)
                if existing and existing.id != user_id:
                    raise ConflictError("Email already registered", "EMAIL_EXISTS")
            user.email = data.email
        if "phone" in fields_set:
            user.phone = data.phone
        if "location" in fields_set:
            user.location = data.location
        # Required fields are only overwritten when a value is actually provided.
        if data.first_name is not None:
            user.first_name = data.first_name
        if data.last_name is not None:
            user.last_name = data.last_name
        # Roles are managed per-facility via assign_roles, not here.
        await self.session.flush()
        return user

    async def deactivate_user(self, user_id: uuid.UUID) -> None:
        user = await self.get_user(user_id)
        user.is_active = False
        user.account_status = AccountStatus.INACTIVE.value
        await self.session.flush()
