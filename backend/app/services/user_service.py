from __future__ import annotations
import re
import uuid
import secrets
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import hash_password
from app.core.spreadsheet import read_csv_rows, read_xlsx_rows
from app.core.tiers import tier_rank
from app.core.exceptions import ConflictError, NotFoundError, ForbiddenError, ValidationError
from app.models.user import User, AccountStatus, UserFacilityRole, UserFacilityUnit
from app.models.facility import Facility
from app.models.unit import Unit
from app.repositories.user_repository import UserRepository
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserImportError,
    UserImportResult,
    VALID_ROLES,
)

# Roles that can be granted to a user within a facility via import. SUPER_ADMIN is
# a global-only grant and is never assigned through a facility-scoped import.
_FACILITY_ASSIGNABLE_ROLES = {r for r in VALID_ROLES if r != "SUPER_ADMIN"}


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

    async def assign_roles(
        self,
        medical_id: str,
        facility_id: uuid.UUID,
        roles: List[str],
        unit_ids: List[uuid.UUID] | None = None,
    ) -> User:
        """Grant the given roles (and clinical-unit memberships) to a user at a
        facility, replacing that facility's existing grants and units."""
        user = await self.repo.get_by_medical_id(medical_id)
        if not user:
            raise NotFoundError("User with that medical ID")

        facility = await self.session.get(Facility, facility_id)
        if not facility:
            raise NotFoundError("Facility")
        if not facility.is_active:
            raise ValidationError(
                "Cannot assign users to a deactivated facility. Reactivate it first."
            )

        # Drop the user's current grants for this facility, then re-add the requested ones.
        user.facility_roles = [fr for fr in user.facility_roles if fr.facility_id != facility_id]
        for role_name in dict.fromkeys(roles):
            role = await self.repo.get_or_create_role(role_name)
            # Populate the role/facility relationships in-memory so serialization
            # does not trigger an async lazy-load on the freshly-created grant.
            user.facility_roles.append(
                UserFacilityRole(facility=facility, role=role)
            )

        # Replace the clinical units the user works in at this facility.
        user.facility_units = [fu for fu in user.facility_units if fu.facility_id != facility_id]
        for unit_id in dict.fromkeys(unit_ids or []):
            unit = await self.session.get(Unit, unit_id)
            if unit is None:
                raise NotFoundError("Unit")
            user.facility_units.append(
                UserFacilityUnit(facility=facility, unit=unit)
            )
        await self.session.flush()
        return user

    async def create_and_assign(
        self,
        data: UserCreate,
        facility_id: uuid.UUID,
        roles: List[str],
        unit_ids: List[uuid.UUID] | None = None,
    ) -> User:
        """Create a new identity, then grant the given roles/units at the facility."""
        user = await self.create_user(data)
        return await self.assign_roles(user.medical_id, facility_id, roles, unit_ids)

    async def remove_from_facility(self, user_id: uuid.UUID, facility_id: uuid.UUID) -> User:
        """Remove all of a user's grants at a facility — both role grants and the
        clinical-unit memberships, so they're fully detached from the facility."""
        user = await self.get_user(user_id)
        user.facility_roles = [fr for fr in user.facility_roles if fr.facility_id != facility_id]
        user.facility_units = [fu for fu in user.facility_units if fu.facility_id != facility_id]
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
        # Clinical-unit membership is managed per-facility via assign_roles, not here.
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

    async def import_users(
        self, file_bytes: bytes, facility_id: uuid.UUID, is_csv: bool = False
    ) -> UserImportResult:
        """Parse an .xlsx or .csv file and bulk register/assign users at a facility.

        Expected header row (case-insensitive): ``medical_id`` (required),
        ``first_name``, ``last_name``, ``email``, ``phone``, ``roles`` and
        ``units``. ``roles`` and ``units`` hold one or more values separated by
        ``;`` / ``,`` / ``|`` / ``/``. Unknown roles or units (or units not
        available at this facility's tier) make the row an error; valid rows are
        still imported. A medical ID that already exists is re-assigned the given
        roles/units rather than re-created.
        """
        facility = await self.session.get(Facility, facility_id)
        if not facility:
            raise NotFoundError("Facility")
        if not facility.is_active:
            raise ValidationError(
                "Cannot assign users to a deactivated facility. Reactivate it first."
            )

        rows = read_csv_rows(file_bytes) if is_csv else read_xlsx_rows(file_bytes)
        if not rows:
            return UserImportResult(created=0, assigned=0, errors=[])

        header = [str(c).strip().lower() if c is not None else "" for c in rows[0]]

        def col(*names: str) -> Optional[int]:
            for name in names:
                if name in header:
                    return header.index(name)
            return None

        idx_mid = col("medical_id", "medical id", "id")
        idx_first = col("first_name", "first name", "firstname")
        idx_last = col("last_name", "last name", "lastname")
        idx_email = col("email")
        idx_phone = col("phone", "phone_number")
        idx_roles = col("roles", "role")
        idx_units = col("units", "unit")
        if idx_mid is None:
            raise ValidationError("Missing required 'medical_id' column in the spreadsheet.")

        # Units available at this facility's tier, by lower-cased name.
        active_units = (
            (await self.session.execute(select(Unit).where(Unit.is_active.is_(True))))
            .scalars()
            .all()
        )
        units_by_name: dict[str, Unit] = {}
        for u in active_units:
            if tier_rank(u.tier) > tier_rank(facility.type):
                continue
            units_by_name.setdefault(u.name.strip().lower(), u)

        errors: List[UserImportError] = []
        created = 0
        assigned = 0
        for i, raw in enumerate(rows[1:], start=2):  # row 1 is the header
            def cell(idx: Optional[int]) -> Optional[str]:
                if idx is None or idx >= len(raw) or raw[idx] is None:
                    return None
                return str(raw[idx]).strip()

            medical_id = cell(idx_mid)
            if not medical_id:
                continue  # skip blank rows silently

            # Roles default to CLINICIAN; values may be separated by ; , | or /.
            roles_raw = cell(idx_roles)
            role_tokens = [t for t in re.split(r"[;,|/]", roles_raw)] if roles_raw else []
            roles = [t.strip().upper().replace(" ", "_") for t in role_tokens if t.strip()]
            roles = roles or ["CLINICIAN"]
            invalid = [r for r in roles if r not in _FACILITY_ASSIGNABLE_ROLES]
            if invalid:
                errors.append(UserImportError(row=i, message=f"Invalid role(s): {', '.join(invalid)}"))
                continue

            units_raw = cell(idx_units)
            unit_tokens = [t.strip() for t in re.split(r"[;,|/]", units_raw)] if units_raw else []
            unit_ids: List[uuid.UUID] = []
            unit_error: str | None = None
            for token in unit_tokens:
                if not token:
                    continue
                unit = units_by_name.get(token.lower())
                if not unit:
                    unit_error = f"Unit '{token}' is not available at this facility"
                    break
                unit_ids.append(unit.id)
            if unit_error:
                errors.append(UserImportError(row=i, message=unit_error))
                continue

            try:
                existing = await self.repo.get_by_medical_id(medical_id)
                if existing is None:
                    first = cell(idx_first)
                    last = cell(idx_last)
                    if not first or not last:
                        errors.append(
                            UserImportError(row=i, message="first_name and last_name are required for new users")
                        )
                        continue
                    email = cell(idx_email) or None
                    if email:
                        clash = await self.repo.get_by_email(email)
                        if clash is not None:
                            errors.append(UserImportError(row=i, message=f"Email '{email}' already registered"))
                            continue
                    user = User(
                        email=email,
                        medical_id=medical_id,
                        first_name=first,
                        last_name=last,
                        phone=cell(idx_phone),
                        password_hash=hash_password(secrets.token_urlsafe(32)),
                        account_status=AccountStatus.PASSWORD_RESET_ENABLED.value,
                    )
                    await self.repo.create(user)
                    created += 1
                await self.assign_roles(medical_id, facility_id, roles, unit_ids)
                assigned += 1
            except (ConflictError, NotFoundError, ValidationError) as exc:
                detail = exc.detail
                message = detail.get("message") if isinstance(detail, dict) else str(detail)
                errors.append(UserImportError(row=i, message=message))
                continue

        await self.session.flush()
        return UserImportResult(created=created, assigned=assigned, errors=errors)
