import uuid
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Integer, ForeignKey, Enum as SAEnum, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin


class ResourceStatus(str, PyEnum):
    """The buckets a resource group's units can fall into. A resource row holds a
    ``quantity`` of identical units split across these counts; AVAILABLE is derived
    from the remainder rather than stored."""
    AVAILABLE = "AVAILABLE"
    OCCUPIED = "OCCUPIED"
    RESERVED = "RESERVED"
    OUT_OF_SERVICE = "OUT_OF_SERVICE"


class ResourceType(str, PyEnum):
    MECHANICAL_VENTILATION = "Mechanical Ventilation"
    ADVANCED_RESPIRATORY_SUPPORT = "Advanced Respiratory Support"
    VASOPRESSOR_INOTROPE_INFUSIONS = "Vasopressor/Inotrope Infusions"
    INVASIVE_HEMODYNAMIC_MONITORING = "Invasive Hemodynamic Monitoring"
    EMERGENCY_SURGERY = "Emergency Surgery"
    ACUTE_RENAL_REPLACEMENT_THERAPY = "Acute Renal Replacement Therapy"
    NEUROLOGICAL_EMERGENCIES = "Neurological Emergencies"
    CT_SCANS_MRI = "CT Scans/MRI"
    ADVANCED_BLOOD_ANALYSIS = "Advanced Blood Analysis"


class Resource(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "resources"

    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"), nullable=True
    )
    facility_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True, index=True
    )
    resource_name: Mapped[str] = mapped_column(String(200), nullable=False)
    resource_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Equipment fields
    resource_type: Mapped[ResourceType | None] = mapped_column(
        SAEnum(
            ResourceType,
            name="resource_type",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=True,
    )
    # ``quantity`` is the total number of identical units in this group; the rest
    # are split across per-status counters. AVAILABLE is whatever's left over.
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    occupied: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reserved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    out_of_service: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    @hybrid_property
    def available(self) -> int:
        return self.quantity - (self.occupied or 0) - (self.reserved or 0) - (self.out_of_service or 0)

    @available.expression
    def available(cls):
        return cls.quantity - cls.occupied - cls.reserved - cls.out_of_service

    unit: Mapped["Unit | None"] = relationship("Unit", back_populates="resources")
    facility: Mapped["Facility | None"] = relationship("Facility")
    reservations: Mapped[list["ResourceReservation"]] = relationship(
        "ResourceReservation", back_populates="resource"
    )


class ResourceReservation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "resource_reservations"

    resource_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resources.id"), nullable=False
    )
    reserved_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    planned_admission_time: Mapped["datetime | None"] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    referral_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("referrals.id"), nullable=True
    )

    resource: Mapped[Resource] = relationship("Resource", back_populates="reservations")
    referral: Mapped["Referral | None"] = relationship("Referral", back_populates="resource_reservations")

from app.models.unit import Unit
from app.models.facility import Facility
