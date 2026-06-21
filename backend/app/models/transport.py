import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin


class TransportEvent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "transport_events"

    referral_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("referrals.id", ondelete="CASCADE"), nullable=False)
    ambulance_identifier: Mapped[str] = mapped_column(String(50), nullable=False)
    driver_name: Mapped[str | None] = mapped_column(String(100))
    driver_phone: Mapped[str | None] = mapped_column(String(20))
    dispatch_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pickup_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    departure_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrival_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    referral: Mapped["Referral"] = relationship("Referral", back_populates="transport_events")
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])


from app.models.referral import Referral
from app.models.user import User
