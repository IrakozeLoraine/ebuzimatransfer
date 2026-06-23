"""ambulance hardware GPS trackers

Adds the ``ambulance_devices`` table (registered hardware trackers), links a
device to a journey via ``transport_events.device_id``, and records which device
reported a position via ``ambulance_location_pings.device_id``.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision = "0010_ambulance_devices"
down_revision = "0009_user_facility_units"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())

    if "ambulance_devices" not in tables:
        op.create_table(
            "ambulance_devices",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("label", sa.String(length=100), nullable=False),
            sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("api_key_hash", sa.String(length=64), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("api_key_hash", name="uq_ambulance_devices_api_key_hash"),
        )
        op.create_index("ix_ambulance_devices_facility_id", "ambulance_devices", ["facility_id"])
        op.create_index("ix_ambulance_devices_api_key_hash", "ambulance_devices", ["api_key_hash"])

    transport_cols = {c["name"] for c in inspect(bind).get_columns("transport_events")}
    if "device_id" not in transport_cols:
        op.add_column("transport_events", sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            "fk_transport_events_device_id", "transport_events", "ambulance_devices",
            ["device_id"], ["id"], ondelete="SET NULL",
        )

    ping_cols = {c["name"] for c in inspect(bind).get_columns("ambulance_location_pings")}
    if "device_id" not in ping_cols:
        op.add_column("ambulance_location_pings", sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            "fk_ambulance_location_pings_device_id", "ambulance_location_pings", "ambulance_devices",
            ["device_id"], ["id"], ondelete="SET NULL",
        )


def downgrade() -> None:
    bind = op.get_bind()

    ping_cols = {c["name"] for c in inspect(bind).get_columns("ambulance_location_pings")}
    if "device_id" in ping_cols:
        op.drop_constraint("fk_ambulance_location_pings_device_id", "ambulance_location_pings", type_="foreignkey")
        op.drop_column("ambulance_location_pings", "device_id")

    transport_cols = {c["name"] for c in inspect(bind).get_columns("transport_events")}
    if "device_id" in transport_cols:
        op.drop_constraint("fk_transport_events_device_id", "transport_events", type_="foreignkey")
        op.drop_column("transport_events", "device_id")

    tables = set(inspect(bind).get_table_names())
    if "ambulance_devices" in tables:
        op.drop_table("ambulance_devices")
