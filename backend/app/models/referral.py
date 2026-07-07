import uuid
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Boolean, ForeignKey, JSON, Table, Column, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin


# A request can ask for several distinct resources at the destination (e.g. a
# ventilator *and* a CT scan), one unit of each. This join table holds that set;
# the receiving side reserves every one of them when it accepts the request.
referral_requested_resources = Table(
    "referral_requested_resources",
    Base.metadata,
    Column("referral_id", UUID(as_uuid=True), ForeignKey("referrals.id", ondelete="CASCADE"), primary_key=True),
    Column("resource_id", UUID(as_uuid=True), ForeignKey("resources.id", ondelete="CASCADE"), primary_key=True),
)


class ReferralStatus(str, PyEnum):
    DRAFT = "DRAFT"                    # call-coordinated, form not yet completed
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
    # A call-coordinated lightweight referral skips the in-app accept/reservation
    # step — the phone call is the coordination — so it goes straight to transport
    # (or to ARRIVED when the transfer uses no tracked transport, or is cancelled).
    ReferralStatus.DRAFT: [ReferralStatus.TRANSPORT_ARRANGED, ReferralStatus.ARRIVED, ReferralStatus.CANCELLED],
    ReferralStatus.REQUESTED: [ReferralStatus.UNDER_REVIEW, ReferralStatus.ACCEPTED, ReferralStatus.REJECTED, ReferralStatus.CANCELLED],
    ReferralStatus.UNDER_REVIEW: [ReferralStatus.ACCEPTED, ReferralStatus.REJECTED, ReferralStatus.CANCELLED],
    # ACCEPTED can go straight to ARRIVED when the transfer uses no tracked transport
    # (the receiving clinician simply confirms the patient arrived).
    ReferralStatus.ACCEPTED: [ReferralStatus.TRANSPORT_ARRANGED, ReferralStatus.ARRIVED, ReferralStatus.CANCELLED],
    # Back to ACCEPTED when the referring clinician removes the assigned ambulance
    # before the journey has started (so they can pick a different one).
    ReferralStatus.TRANSPORT_ARRANGED: [ReferralStatus.ACCEPTED, ReferralStatus.EN_ROUTE, ReferralStatus.CANCELLED],
    ReferralStatus.EN_ROUTE: [ReferralStatus.ARRIVED],
    ReferralStatus.ARRIVED: [],
    ReferralStatus.REJECTED: [],
    ReferralStatus.CANCELLED: [],
}


class Referral(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "referrals"

    referral_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    age_band: Mapped[str] = mapped_column(String(20), nullable=False)
    sex: Mapped[str] = mapped_column(String(10), nullable=False)
    diagnosis: Mapped[str] = mapped_column(String(500), nullable=False)
    comorbidities: Mapped[str | None] = mapped_column(String(500), nullable=True)
    acuity_level: Mapped[str] = mapped_column(String(20), nullable=False)
    urgency: Mapped[str] = mapped_column(String(20), nullable=False)
    reason_for_transfer: Mapped[str] = mapped_column(String(1000), nullable=False)
    ventilator_needed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    high_flow_oxygen_needed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Which Rwanda MoH transfer-form variant this request was filled with — drives
    # the form-specific fields shown to both sides. The core columns above stay the
    # same across all variants (they're what routing/decisions need); everything
    # specific to a given paper form lives in ``form_data`` as a flat JSON map.
    form_type: Mapped[str] = mapped_column(String(20), default="EXTERNAL", nullable=False)
    form_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # False for a call-coordinated lightweight referral whose full MoH transfer form
    # hasn't been filled in yet — the referring side completes it later (even after
    # transport is arranged). True for referrals created with the full form up front.
    form_completed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Every Patient Monitoring Transfer Form the ambulance driver records by voice
    # during transport, oldest first — each holds the recording, its transcript and
    # summary, and the extracted vital-signs / problem log. Recordings are appended
    # (never overwritten) so both clinics and the driver can replay each one. Null
    # until the driver records the first monitoring.
    transport_monitorings: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Filled at the receiving facility per case: the Referral Feedback (outcome of
    # the transferred patient) and the Counter-Referral (recommendations / refer-back).
    # Both are flat JSON maps keyed by the receiving-form field names.
    feedback_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    counter_referral_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Voice-dictated referrals: the kept recording (URL served by the API), the raw
    # speech-to-text transcript, and a short AI summary. All optional — a referral
    # may be filled in entirely by hand with no audio attached.
    audio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

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

    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    # The resources the requester is asking for at the destination — one or more,
    # captured (and validated as available) up front so the receiving side knows
    # exactly what was requested. Loaded so the referral can surface their names
    # across facilities (the resources list endpoint is facility-scoped, so the
    # requesting side can't resolve the destination's resources by id).
    requested_resources: Mapped[list["Resource"]] = relationship(
        "Resource", secondary=referral_requested_resources
    )
    status_history: Mapped[list["ReferralStatusHistory"]] = relationship(
        "ReferralStatusHistory",
        back_populates="referral",
        cascade="all, delete-orphan",
        order_by="ReferralStatusHistory.created_at",
    )
    transport_events: Mapped[list["TransportEvent"]] = relationship(
        "TransportEvent", back_populates="referral", cascade="all, delete-orphan"
    )
    # One reservation per resource held for this request (the receiving side
    # reserves every requested resource that's still available when it accepts).
    resource_reservations: Mapped[list["ResourceReservation"]] = relationship(
        "ResourceReservation", back_populates="referral"
    )

    @property
    def reserved_resource_ids(self) -> list[uuid.UUID]:
        """Ids of the requested resources actually held for this request. A request
        can be accepted with only some of its resources reserved (the rest were no
        longer available), so both sides can tell which asks were fulfilled. Relies
        on ``resource_reservations`` being eager loaded (get_with_relations does)."""
        return [r.resource_id for r in self.resource_reservations]


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
