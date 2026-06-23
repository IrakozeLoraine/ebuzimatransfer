import uuid
import enum
from sqlalchemy import Boolean, String, ForeignKey, UniqueConstraint, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin


class AccountStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    PASSWORD_RESET_ENABLED = "PASSWORD_RESET_ENABLED"


class Role(Base, UUIDMixin):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)


class UserFacilityRole(Base, UUIDMixin):
    """A grant of a single role to a user, scoped to a facility.

    ``facility_id`` is nullable: a NULL facility represents a *global* grant
    (e.g. SUPER_ADMIN, ambulance coordinator) that applies regardless of the
    facility the user is acting in.
    """

    __tablename__ = "user_facility_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "facility_id", "role_id", name="uq_user_facility_role"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    facility_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=True, index=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="facility_roles")
    role: Mapped[Role] = relationship("Role", lazy="joined")
    facility: Mapped["Facility | None"] = relationship("Facility", lazy="joined")


class UserFacilityUnit(Base, UUIDMixin):
    """A clinician's membership in a clinical unit at a specific facility.

    A clinician can work in several units at one facility, and in different
    units across facilities — so membership is keyed on (user, facility, unit).
    """

    __tablename__ = "user_facility_units"
    __table_args__ = (
        UniqueConstraint("user_id", "facility_id", "unit_id", name="uq_user_facility_unit"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    facility_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="facility_units")
    facility: Mapped["Facility"] = relationship("Facility", lazy="joined")
    unit: Mapped["Unit"] = relationship("Unit", lazy="joined")


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    medical_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    account_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default=AccountStatus.ACTIVE.value
    )

    facility_roles: Mapped[list[UserFacilityRole]] = relationship(
        "UserFacilityRole",
        back_populates="user",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    facility_units: Mapped[list[UserFacilityUnit]] = relationship(
        "UserFacilityUnit",
        back_populates="user",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="user")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def facilities(self) -> list["Facility"]:
        """Distinct facilities the user is a member of (has at least one role at)."""
        seen: dict[uuid.UUID, "Facility"] = {}
        for fr in self.facility_roles:
            if fr.facility is not None and fr.facility.id not in seen:
                seen[fr.facility.id] = fr.facility
        return list(seen.values())

    @property
    def global_role_names(self) -> list[str]:
        return sorted({fr.role.name for fr in self.facility_roles if fr.facility_id is None})

    def roles_for_facility(self, facility_id: uuid.UUID | None) -> list[str]:
        if facility_id is None:
            return []
        return sorted(
            {fr.role.name for fr in self.facility_roles if fr.facility_id == facility_id}
        )

    def effective_role_names(self, active_facility_id: uuid.UUID | None) -> list[str]:
        """Roles in effect for the active facility: global grants plus that facility's grants."""
        return sorted(set(self.global_role_names) | set(self.roles_for_facility(active_facility_id)))

    def units_for_facility(self, facility_id: uuid.UUID | None) -> list["UserFacilityUnit"]:
        """The clinical units this clinician works in at the given facility."""
        if facility_id is None:
            return []
        return [fu for fu in self.facility_units if fu.facility_id == facility_id]

    @property
    def unit_ids(self) -> list[uuid.UUID]:
        """All clinical units this clinician works in, across every facility."""
        return list({fu.unit_id for fu in self.facility_units})


# Avoid circular imports
from app.models.audit_log import AuditLog


class UserRole:
    # A single clinician role; whether a clinician is "referring" or "receiving"
    # is derived from the facility/tier they are working in for a given request.
    CLINICIAN = "CLINICIAN"
    AMBULANCE_COORDINATOR = "AMBULANCE_COORDINATOR"
    FACILITY_ADMIN = "FACILITY_ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"

    ALL = [
        CLINICIAN,
        AMBULANCE_COORDINATOR,
        FACILITY_ADMIN,
        SUPER_ADMIN,
    ]
