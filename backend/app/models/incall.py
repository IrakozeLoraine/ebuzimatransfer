import uuid
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import ForeignKey, Enum as SAEnum, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin


class InAppCallStatus(str, PyEnum):
    RINGING = "RINGING"      # caller dialed, awaiting callee
    ONGOING = "ONGOING"      # callee answered, media flowing
    ENDED = "ENDED"          # answered then hung up
    DECLINED = "DECLINED"    # callee rejected
    MISSED = "MISSED"        # rang out / callee never answered
    CANCELLED = "CANCELLED"  # caller hung up before it was answered


class InAppCall(Base, UUIDMixin, TimestampMixin):
    """An in-app voice call to a receiving hospital's emergency desk, optionally tied
    to a referral. The call rings the facility's on-duty personnel; whoever answers
    becomes ``callee_id``. WebRTC media is peer-to-peer; this row tracks the call
    lifecycle for ringing, history and audit. Signaling (SDP/ICE) is relayed over
    the per-user WebSocket channel and not stored."""

    __tablename__ = "in_app_calls"

    # Caller is a user (clinician) OR an ambulance (driver app) — exactly one is set.
    caller_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    caller_ambulance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ambulances.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # The hospital desk being called. Whoever on duty answers fills ``callee_id``.
    callee_facility_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # When the callee is an ambulance (driver app) rather than a unit's clinicians.
    callee_ambulance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ambulances.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # The clinical unit being called: only clinicians who work in this unit at the
    # facility are rung. Null = whole-facility desk (legacy/directory calls).
    callee_unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="SET NULL"), nullable=True, index=True
    )
    callee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    referral_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("referrals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[InAppCallStatus] = mapped_column(
        SAEnum(InAppCallStatus, name="in_app_call_status"), default=InAppCallStatus.RINGING, nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    caller: Mapped["User | None"] = relationship("User", foreign_keys=[caller_id])
    callee: Mapped["User | None"] = relationship("User", foreign_keys=[callee_id])
    callee_facility: Mapped["Facility"] = relationship("Facility", foreign_keys=[callee_facility_id])
    callee_unit: Mapped["Unit | None"] = relationship("Unit", foreign_keys=[callee_unit_id])
    caller_ambulance: Mapped["Ambulance | None"] = relationship("Ambulance", foreign_keys=[caller_ambulance_id])
    callee_ambulance: Mapped["Ambulance | None"] = relationship("Ambulance", foreign_keys=[callee_ambulance_id])


from app.models.user import User  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.unit import Unit  # noqa: E402
from app.models.ambulance import Ambulance  # noqa: E402
