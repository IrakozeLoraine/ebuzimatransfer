from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin


class Unit(Base, UUIDMixin, TimestampMixin):
    """A clinical unit type in the global, tier-scoped catalog.

    The catalog is managed by the super admin. A facility automatically
    exposes every unit whose ``tier`` is at or below the facility's own tier
    (see ``app.core.tiers``).
    """

    __tablename__ = "units"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Facility-tier value at which this unit is introduced (cascades upward).
    tier: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    resources: Mapped[list["Resource"]] = relationship(
        "Resource", back_populates="unit"
    )


from app.models.resource import Resource
