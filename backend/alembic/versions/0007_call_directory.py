"""institutional call directory + call logging

Adds ``facility_phone_lines`` (department/institutional numbers configured per
facility) and ``call_logs`` (a record each time a clinician places a coordination
call from the web).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision = "0007_call_directory"
down_revision = "0006_clinician_role_and_unit"
branch_labels = None
depends_on = None

PHONE_LINE_TYPE = postgresql.ENUM(
    "EMERGENCY", "COORDINATION", "SUPERVISOR", "TOLLFREE", "DISPATCH", "OTHER",
    name="phone_line_type", create_type=False,
)


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    PHONE_LINE_TYPE.create(bind, checkfirst=True)

    if "facility_phone_lines" not in tables:
        op.create_table(
            "facility_phone_lines",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("label", sa.String(length=120), nullable=False),
            sa.Column("phone_number", sa.String(length=40), nullable=False),
            sa.Column("line_type", PHONE_LINE_TYPE, nullable=False, server_default="COORDINATION"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            *_ts(),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_facility_phone_lines_facility_id", "facility_phone_lines", ["facility_id"])

    if "call_logs" not in tables:
        op.create_table(
            "call_logs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("referral_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("from_line_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("to_facility_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("to_number", sa.String(length=40), nullable=False),
            sa.Column("placed_by", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("purpose", sa.String(length=200), nullable=True),
            sa.Column("notes", sa.String(length=500), nullable=True),
            *_ts(),
            sa.ForeignKeyConstraint(["referral_id"], ["referrals.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["from_line_id"], ["facility_phone_lines.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["to_facility_id"], ["facilities.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["placed_by"], ["users.id"]),
        )
        op.create_index("ix_call_logs_referral_id", "call_logs", ["referral_id"])


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    for table in ["call_logs", "facility_phone_lines"]:
        if table in tables:
            op.drop_table(table)
    PHONE_LINE_TYPE.drop(bind, checkfirst=True)
