"""resource inventory: capacity schema + central/unassigned stock

Creates the capacity domain tables (``units``, ``resources``,
``resource_reservations``) and their enum types when they are absent, with the
final shape that supports central stock: ``resources.unit_id`` is nullable and
an optional ``resources.facility_id`` records the owning facility (NULL =
unassigned central stock).

If a legacy ``resources`` table already exists (e.g. built from an earlier
model via ``create_all``), the migration instead applies the in-place delta:
make ``unit_id`` nullable and add ``facility_id``.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0002_resource_inventory"
down_revision = "0001_per_facility_roles"
branch_labels = None
depends_on = None

RESOURCE_STATUS = postgresql.ENUM(
    "AVAILABLE", "OCCUPIED", "RESERVED", "OUT_OF_SERVICE",
    name="resource_status",
    create_type=False,
)
RESOURCE_TYPE_VALUES = [
    "Mechanical Ventilation",
    "Advanced Respiratory Support",
    "Vasopressor/Inotrope Infusions",
    "Invasive Hemodynamic Monitoring",
    "Emergency Surgery",
    "Acute Renal Replacement Therapy",
    "Neurological Emergencies",
    "CT Scans/MRI",
    "Advanced Blood Analysis",
]
RESOURCE_TYPE = postgresql.ENUM(*RESOURCE_TYPE_VALUES, name="resource_type", create_type=False)


def _ts_columns() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "resources" in tables:
        # Legacy in-place upgrade.
        op.alter_column("resources", "unit_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
        op.add_column("resources", sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            "fk_resources_facility_id", "resources", "facilities", ["facility_id"], ["id"], ondelete="SET NULL"
        )
        op.create_index("ix_resources_facility_id", "resources", ["facility_id"])
        op.execute(
            """
            UPDATE resources AS r SET facility_id = u.facility_id
            FROM units AS u WHERE r.unit_id = u.id AND r.facility_id IS NULL
            """
        )
        return

    # Fresh creation of the capacity schema.
    RESOURCE_STATUS.create(bind, checkfirst=True)
    RESOURCE_TYPE.create(bind, checkfirst=True)

    if "units" not in tables:
        op.create_table(
            "units",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("type", sa.String(length=10), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            *_ts_columns(),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        )

    op.create_table(
        "resources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resource_name", sa.String(length=200), nullable=False),
        sa.Column("resource_code", sa.String(length=50), nullable=True),
        sa.Column("status", RESOURCE_STATUS, nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("resource_type", RESOURCE_TYPE, nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
        *_ts_columns(),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_resources_facility_id", "resources", ["facility_id"])

    op.create_table(
        "resource_reservations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reserved_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("planned_admission_time", sa.DateTime(timezone=True), nullable=True),
        *_ts_columns(),
        sa.ForeignKeyConstraint(["resource_id"], ["resources.id"]),
        sa.ForeignKeyConstraint(["reserved_by"], ["users.id"]),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "resources" not in tables:
        return

    fk_names = {fk["name"] for fk in inspector.get_foreign_keys("resources")}
    if "fk_resources_facility_id" in fk_names:
        # Legacy in-place upgrade was applied -> reverse just the delta.
        op.drop_index("ix_resources_facility_id", table_name="resources")
        op.drop_constraint("fk_resources_facility_id", "resources", type_="foreignkey")
        op.drop_column("resources", "facility_id")
        op.alter_column("resources", "unit_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
        return

    # Fresh creation path -> drop the tables and enums this migration created.
    op.drop_table("resource_reservations")
    op.drop_table("resources")
    if "units" in tables:
        op.drop_table("units")
    RESOURCE_TYPE.drop(bind, checkfirst=True)
    RESOURCE_STATUS.drop(bind, checkfirst=True)
