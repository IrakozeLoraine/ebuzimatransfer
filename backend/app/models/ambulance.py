import uuid
from datetime import datetime, timezone
from sqlalchemy import Float, ForeignKey, DateTime, String, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin


class Ambulance(Base, UUIDMixin, TimestampMixin):
    """An ambulance operated by a facility.

    The ambulance is also the login principal for the driver's phone app: the
    driver signs in with the ``login_id`` and password set when the facility
    registers it (no hardware keys/tokens). Once a clinician assigns the
    ambulance to a transfer, the driver's app shows that one journey and the
    phone streams its GPS position.
    """
    __tablename__ = "ambulances"

    # Owning hospital; only this facility's staff manage/assign the ambulance.
    facility_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True, index=True
    )
    plate_number: Mapped[str] = mapped_column(String(50), nullable=False)
    driver_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    driver_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Driver login for the phone app (login_id is typed by the driver, not generated).
    login_id: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    facility: Mapped["Facility | None"] = relationship("Facility")


class AmbulanceLocationPing(Base, UUIDMixin):
    """A GPS position streamed by an ambulance's phone app during a transfer."""
    __tablename__ = "ambulance_location_pings"

    referral_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("referrals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    # The ambulance whose phone reported this position.
    ambulance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ambulances.id", ondelete="SET NULL"), nullable=True
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


from app.models.facility import Facility
