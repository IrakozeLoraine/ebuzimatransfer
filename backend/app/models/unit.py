import uuid
from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin


class Unit(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "units"

    facility_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # ICU | HDU
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    facility: Mapped["Facility"] = relationship("Facility", back_populates="units")
    resources: Mapped[list["Resource"]] = relationship(
        "Resource", back_populates="unit", cascade="all, delete-orphan"
    )


from app.models.facility import Facility
from app.models.resource import Resource
