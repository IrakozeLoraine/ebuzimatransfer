import uuid
from enum import Enum as PyEnum
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin


class ReferralStatus(str, PyEnum):
    REQUESTED = "REQUESTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    ACCEPTED = "ACCEPTED"
    TRANSPORT_ARRANGED = "TRANSPORT_ARRANGED"
    EN_ROUTE = "EN_ROUTE"
    ARRIVED = "ARRIVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


ALLOWED_TRANSITIONS: dict[ReferralStatus, list[ReferralStatus]] = {
    ReferralStatus.REQUESTED: [ReferralStatus.UNDER_REVIEW, ReferralStatus.REJECTED, ReferralStatus.CANCELLED],
    ReferralStatus.UNDER_REVIEW: [ReferralStatus.ACCEPTED, ReferralStatus.REJECTED],
    ReferralStatus.ACCEPTED: [ReferralStatus.TRANSPORT_ARRANGED, ReferralStatus.CANCELLED],
    ReferralStatus.TRANSPORT_ARRANGED: [ReferralStatus.EN_ROUTE, ReferralStatus.CANCELLED],
    ReferralStatus.EN_ROUTE: [ReferralStatus.ARRIVED],
    ReferralStatus.ARRIVED: [],
    ReferralStatus.REJECTED: [],
    ReferralStatus.CANCELLED: [],
}


class Referral(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "referrals"

    referral_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    patient_code: Mapped[str] = mapped_column(String(50), nullable=False)
    age_band: Mapped[str] = mapped_column(String(20), nullable=False)
    sex: Mapped[str] = mapped_column(String(10), nullable=False)
    diagnosis: Mapped[str] = mapped_column(Text, nullable=False)
    comorbidities: Mapped[str | None] = mapped_column(Text)
    acuity_level: Mapped[str] = mapped_column(String(20), nullable=False)
    urgency: Mapped[str] = mapped_column(String(20), nullable=False)
    reason_for_transfer: Mapped[str] = mapped_column(Text, nullable=False)
    ventilator_needed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    high_flow_oxygen_needed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[ReferralStatus] = mapped_column(SAEnum(ReferralStatus, name="referral_status"), default=ReferralStatus.REQUESTED, nullable=False)
    rejection_reason: Mapped[str | None] = mapped_column(String(50))
    rejection_comment: Mapped[str | None] = mapped_column(Text)

    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    referring_facility_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("facilities.id"), nullable=True)
    preferred_facility_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("facilities.id"), nullable=True)
    accepted_facility_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("facilities.id"), nullable=True)

    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    referring_facility: Mapped["Facility | None"] = relationship("Facility", foreign_keys=[referring_facility_id])
    preferred_facility: Mapped["Facility | None"] = relationship("Facility", foreign_keys=[preferred_facility_id])
    accepted_facility: Mapped["Facility | None"] = relationship("Facility", foreign_keys=[accepted_facility_id])
    status_history: Mapped[list["ReferralStatusHistory"]] = relationship("ReferralStatusHistory", back_populates="referral", order_by="ReferralStatusHistory.created_at")
    resource_reservation: Mapped["ResourceReservation | None"] = relationship("ResourceReservation", back_populates="referral", uselist=False)
    transport_events: Mapped[list["TransportEvent"]] = relationship("TransportEvent", back_populates="referral")


class ReferralStatusHistory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "referral_status_history"

    referral_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("referrals.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[ReferralStatus] = mapped_column(SAEnum(ReferralStatus, name="referral_status", create_type=False), nullable=False)
    changed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)

    referral: Mapped[Referral] = relationship("Referral", back_populates="status_history")
    actor: Mapped["User"] = relationship("User", foreign_keys=[changed_by])


from app.models.user import User
from app.models.facility import Facility
from app.models.resource import ResourceReservation
from app.models.transport import TransportEvent
