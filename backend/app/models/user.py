import uuid, enum
from sqlalchemy import Boolean, String, Table, Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin

user_roles_table = Table(
    "user_roles", Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

user_facilities_table = Table(
    "user_facilities", Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("facility_id", UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="CASCADE"), primary_key=True),
)

class AccountStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    PASSWORD_RESET_ENABLED = "PASSWORD_RESET_ENABLED"

class Role(Base, UUIDMixin):
    __tablename__ = "roles"
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    users: Mapped[list["User"]] = relationship("User", secondary=user_roles_table, back_populates="roles")

class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    medical_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    account_status: Mapped[str] = mapped_column(String(30), nullable=False, default=AccountStatus.ACTIVE.value)

    roles: Mapped[list[Role]] = relationship("Role", secondary=user_roles_table, back_populates="users", lazy="selectin")
    facilities: Mapped[list["Facility"]] = relationship("Facility", secondary=user_facilities_table, back_populates="users", lazy="selectin")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def role_names(self) -> list[str]:
        return [r.name for r in self.roles]

    @property
    def primary_facility_id(self) -> uuid.UUID | None:
        return self.facilities[0].id if self.facilities else None

class UserRole:
    REFERRING_CLINICIAN = "REFERRING_CLINICIAN"
    ICU_COORDINATOR = "ICU_COORDINATOR"
    FACILITY_ADMIN = "FACILITY_ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"

    ALL = [
        REFERRING_CLINICIAN,
        ICU_COORDINATOR,
        FACILITY_ADMIN,
        SUPER_ADMIN,
    ]

# Avoid circular imports
from app.models.facility import Facility