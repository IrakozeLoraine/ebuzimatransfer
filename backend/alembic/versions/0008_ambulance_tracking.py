"""ambulance GPS tracking: facility coordinates + location pings

Adds ``facilities.latitude/longitude`` (route endpoints) and the
``ambulance_location_pings`` table (live GPS positions during transit).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision = "0008_ambulance_tracking"
down_revision = "0007_call_directory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("facilities")}
    if "latitude" not in cols:
        op.add_column("facilities", sa.Column("latitude", sa.Float(), nullable=True))
    if "longitude" not in cols:
        op.add_column("facilities", sa.Column("longitude", sa.Float(), nullable=True))

    tables = set(inspect(bind).get_table_names())
    if "ambulance_location_pings" not in tables:
        op.create_table(
            "ambulance_location_pings",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("referral_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("latitude", sa.Float(), nullable=False),
            sa.Column("longitude", sa.Float(), nullable=False),
            sa.Column("reported_by", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["referral_id"], ["referrals.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["reported_by"], ["users.id"]),
        )
        op.create_index("ix_ambulance_location_pings_referral_id", "ambulance_location_pings", ["referral_id"])


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    if "ambulance_location_pings" in tables:
        op.drop_table("ambulance_location_pings")
    cols = {c["name"] for c in inspect(bind).get_columns("facilities")}
    if "longitude" in cols:
        op.drop_column("facilities", "longitude")
    if "latitude" in cols:
        op.drop_column("facilities", "latitude")
