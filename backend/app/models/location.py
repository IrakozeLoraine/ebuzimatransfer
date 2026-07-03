import uuid
from sqlalchemy import String, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, UUIDMixin


class Location(Base, UUIDMixin):
    """One node in the Rwanda administrative hierarchy — a self-referential tree of
    Province → District → Sector → Cell → Village. Seeded into the database (see
    ``seeds.seed_locations``); the location endpoints query it to cascade the
    address pickers."""

    __tablename__ = "locations"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # PROVINCE | DISTRICT | SECTOR | CELL | VILLAGE
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), nullable=True, index=True
    )

    __table_args__ = (
        Index("ix_locations_parent_name", "parent_id", "name"),
        Index("ix_locations_level", "level"),
    )
