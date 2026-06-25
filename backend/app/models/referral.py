import uuid
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin


class ReferralStatus(str, PyEnum):
    REQUESTED = "REQUESTED"            # pending
    UNDER_REVIEW = "UNDER_REVIEW"      # pending
    ACCEPTED = "ACCEPTED"             # approved
    TRANSPORT_ARRANGED = "TRANSPORT_ARRANGED"  # approved, ready for transport
    EN_ROUTE = "EN_ROUTE"            # approved, in transit
    ARRIVED = "ARRIVED"              # approved, completed
    REJECTED = "REJECTED"            # rejected
    CANCELLED = "CANCELLED"


class ArrivalCondition(str, PyEnum):
    STABLE = "STABLE"
    CRITICAL = "CRITICAL"
    DETERIORATED = "DETERIORATED"
    ARRIVED_DECEASED = "ARRIVED_DECEASED"


# Permitted forward transitions between statuses.
ALLOWED_TRANSITIONS: dict[ReferralStatus, list[ReferralStatus]] = {
    ReferralStatus.REQUESTED: [ReferralStatus.UNDER_REVIEW, ReferralStatus.ACCEPTED, ReferralStatus.REJECTED, ReferralStatus.CANCELLED],
    ReferralStatus.UNDER_REVIEW: [ReferralStatus.ACCEPTED, ReferralStatus.REJECTED, ReferralStatus.CANCELLED],
    # ACCEPTED can go straight to ARRIVED when the transfer uses no tracked transport
    # (the receiving clinician simply confirms the patient arrived).
    ReferralStatus.ACCEPTED: [ReferralStatus.TRANSPORT_ARRANGED, ReferralStatus.ARRIVED, ReferralStatus.CANCELLED],
    ReferralStatus.TRANSPORT_ARRANGED: [ReferralStatus.EN_ROUTE, ReferralStatus.CANCELLED],
    ReferralStatus.EN_ROUTE: [ReferralStatus.ARRIVED],
    ReferralStatus.ARRIVED: [],
    ReferralStatus.REJECTED: [],
    ReferralStatus.CANCELLED: [],
}


class Referral(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "referrals"

    referral_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    patient_code: Mapped[str] = mapped_column(String(50), nullable=False)
    age_band: Mapped[str] = mapped_column(String(20), nullable=False)
    sex: Mapped[str] = mapped_column(String(10), nullable=False)
    diagnosis: Mapped[str] = mapped_column(String(500), nullable=False)
    comorbidities: Mapped[str | None] = mapped_column(String(500), nullable=True)
    acuity_level: Mapped[str] = mapped_column(String(20), nullable=False)
    urgency: Mapped[str] = mapped_column(String(20), nullable=False)
    reason_for_transfer: Mapped[str] = mapped_column(String(1000), nullable=False)
    ventilator_needed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    high_flow_oxygen_needed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    status: Mapped[ReferralStatus] = mapped_column(
        SAEnum(ReferralStatus, name="referral_status"), default=ReferralStatus.REQUESTED, nullable=False
    )
    rejection_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rejection_comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    arrival_condition: Mapped[ArrivalCondition | None] = mapped_column(
        SAEnum(ArrivalCondition, name="arrival_condition"), nullable=True
    )

    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    referring_facility_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("facilities.id"), nullable=True)
    preferred_facility_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("facilities.id"), nullable=True)
    accepted_facility_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("facilities.id"), nullable=True)
    origin_unit_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("units.id"), nullable=True)
    requested_unit_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("units.id"), nullable=True)
    # The specific resource the requester is asking for at the destination. Captured
    # (and validated as available) up front so the receiving side knows exactly what
    # was requested; the approver still reserves the actual unit on accept.
    requested_resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("resources.id"), nullable=True)

    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    status_history: Mapped[list["ReferralStatusHistory"]] = relationship(
        "ReferralStatusHistory",
        back_populates="referral",
        cascade="all, delete-orphan",
        order_by="ReferralStatusHistory.created_at",
    )
    transport_events: Mapped[list["TransportEvent"]] = relationship(
        "TransportEvent", back_populates="referral", cascade="all, delete-orphan"
    )
    resource_reservation: Mapped["ResourceReservation | None"] = relationship(
        "ResourceReservation", back_populates="referral", uselist=False
    )


class ReferralStatusHistory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "referral_status_history"

    referral_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("referrals.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[ReferralStatus] = mapped_column(SAEnum(ReferralStatus, name="referral_status"), nullable=False)
    # Null when the change was driven by an ambulance driver (not a staff user),
    # e.g. start/arrival actions from the driver phone app.
    changed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    comment: Mapped[str | None] = mapped_column(String(500), nullable=True)

    referral: Mapped["Referral"] = relationship("Referral", back_populates="status_history")
    actor: Mapped["User | None"] = relationship("User", foreign_keys=[changed_by])


from app.models.user import User  # noqa: E402
from app.models.transport import TransportEvent  # noqa: E402
from app.models.resource import ResourceReservation  # noqa: E402
