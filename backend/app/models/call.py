import uuid
from enum import Enum as PyEnum
from sqlalchemy import String, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin


class PhoneLineType(str, PyEnum):
    EMERGENCY = "EMERGENCY"
    COORDINATION = "COORDINATION"
    SUPERVISOR = "SUPERVISOR"
    TOLLFREE = "TOLLFREE"
    DISPATCH = "DISPATCH"
    OTHER = "OTHER"


class FacilityPhoneLine(Base, UUIDMixin, TimestampMixin):
    """A department/institutional phone line a clinician can call from the web to
    confirm resource availability. Configured per facility by the super admin."""
    __tablename__ = "facility_phone_lines"

    facility_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(40), nullable=False)
    line_type: Mapped[PhoneLineType] = mapped_column(
        SAEnum(PhoneLineType, name="phone_line_type"), default=PhoneLineType.COORDINATION, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    facility: Mapped["Facility"] = relationship("Facility")


class CallLog(Base, UUIDMixin, TimestampMixin):
    """A record that a clinician placed a call (from an institutional line) to a
    facility to coordinate a transfer. Kept for future reference/audit."""
    __tablename__ = "call_logs"

    referral_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("referrals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    from_line_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facility_phone_lines.id", ondelete="SET NULL"), nullable=True
    )
    to_facility_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True
    )
    to_number: Mapped[str] = mapped_column(String(40), nullable=False)
    placed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    purpose: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    from_line: Mapped["FacilityPhoneLine | None"] = relationship("FacilityPhoneLine")
    caller: Mapped["User"] = relationship("User", foreign_keys=[placed_by])


from app.models.facility import Facility  # noqa: E402
from app.models.user import User  # noqa: E402
