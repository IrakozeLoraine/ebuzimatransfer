import uuid
from datetime import datetime, timezone
from sqlalchemy import Float, ForeignKey, DateTime, String, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, UUIDMixin, TimestampMixin


class AmbulanceDevice(Base, UUIDMixin, TimestampMixin):
    """A physical GPS tracker mounted in an ambulance.

    The device authenticates with a high-entropy API key (only its SHA-256 hash
    is stored) and reports its position independently of any clinician. A device
    is assigned to a journey when the referring clinician arranges transport.
    """
    __tablename__ = "ambulance_devices"

    label: Mapped[str] = mapped_column(String(100), nullable=False)
    # Owning hospital; only this facility's staff manage/assign the device.
    facility_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # SHA-256 of the API key. The plaintext key is shown once, at creation.
    api_key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class AmbulanceLocationPing(Base, UUIDMixin):
    """A GPS position reported by an ambulance in transit for a transfer request."""
    __tablename__ = "ambulance_location_pings"

    referral_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("referrals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    # The hardware tracker that reported this position (null for legacy pings).
    device_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ambulance_devices.id", ondelete="SET NULL"), nullable=True
    )
    reported_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
