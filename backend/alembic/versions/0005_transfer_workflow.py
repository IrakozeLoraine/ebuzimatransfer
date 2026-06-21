"""transfer workflow: referrals, status history, transport events, notifications

Creates the patient transfer-request domain: ``referrals`` (+ ``referral_status``
and ``arrival_condition`` enums), ``referral_status_history``, ``transport_events``,
and ``notifications``; and links a reservation to the request it fulfils via
``resource_reservations.referral_id``.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0005_transfer_workflow"
down_revision = "0004_user_location"
branch_labels = None
depends_on = None

REFERRAL_STATUS = postgresql.ENUM(
    "REQUESTED", "UNDER_REVIEW", "ACCEPTED", "TRANSPORT_ARRANGED",
    "EN_ROUTE", "ARRIVED", "REJECTED", "CANCELLED",
    name="referral_status", create_type=False,
)
ARRIVAL_CONDITION = postgresql.ENUM(
    "STABLE", "CRITICAL", "DETERIORATED", "ARRIVED_DECEASED",
    name="arrival_condition", create_type=False,
)


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())

    REFERRAL_STATUS.create(bind, checkfirst=True)
    ARRIVAL_CONDITION.create(bind, checkfirst=True)

    if "referrals" not in tables:
        op.create_table(
            "referrals",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("referral_number", sa.String(length=30), nullable=False),
            sa.Column("patient_code", sa.String(length=50), nullable=False),
            sa.Column("age_band", sa.String(length=20), nullable=False),
            sa.Column("sex", sa.String(length=10), nullable=False),
            sa.Column("diagnosis", sa.String(length=500), nullable=False),
            sa.Column("comorbidities", sa.String(length=500), nullable=True),
            sa.Column("acuity_level", sa.String(length=20), nullable=False),
            sa.Column("urgency", sa.String(length=20), nullable=False),
            sa.Column("reason_for_transfer", sa.String(length=1000), nullable=False),
            sa.Column("ventilator_needed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("high_flow_oxygen_needed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("status", REFERRAL_STATUS, nullable=False, server_default="REQUESTED"),
            sa.Column("rejection_reason", sa.String(length=200), nullable=True),
            sa.Column("rejection_comment", sa.String(length=500), nullable=True),
            sa.Column("arrival_condition", ARRIVAL_CONDITION, nullable=True),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("referring_facility_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("preferred_facility_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("accepted_facility_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("origin_unit_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("requested_unit_id", postgresql.UUID(as_uuid=True), nullable=True),
            *_ts(),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
            sa.ForeignKeyConstraint(["referring_facility_id"], ["facilities.id"]),
            sa.ForeignKeyConstraint(["preferred_facility_id"], ["facilities.id"]),
            sa.ForeignKeyConstraint(["accepted_facility_id"], ["facilities.id"]),
            sa.ForeignKeyConstraint(["origin_unit_id"], ["units.id"]),
            sa.ForeignKeyConstraint(["requested_unit_id"], ["units.id"]),
        )
        op.create_index("ix_referrals_referral_number", "referrals", ["referral_number"], unique=True)

    if "referral_status_history" not in tables:
        op.create_table(
            "referral_status_history",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("referral_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("status", REFERRAL_STATUS, nullable=False),
            sa.Column("changed_by", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("comment", sa.String(length=500), nullable=True),
            *_ts(),
            sa.ForeignKeyConstraint(["referral_id"], ["referrals.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["changed_by"], ["users.id"]),
        )

    if "transport_events" not in tables:
        op.create_table(
            "transport_events",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("referral_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("ambulance_identifier", sa.String(length=50), nullable=False),
            sa.Column("driver_name", sa.String(length=100), nullable=True),
            sa.Column("driver_phone", sa.String(length=20), nullable=True),
            sa.Column("dispatch_time", sa.DateTime(timezone=True), nullable=True),
            sa.Column("pickup_time", sa.DateTime(timezone=True), nullable=True),
            sa.Column("departure_time", sa.DateTime(timezone=True), nullable=True),
            sa.Column("arrival_time", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
            *_ts(),
            sa.ForeignKeyConstraint(["referral_id"], ["referrals.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        )

    if "notifications" not in tables:
        op.create_table(
            "notifications",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("message", sa.String(length=1000), nullable=False),
            sa.Column("event_type", sa.String(length=50), nullable=True),
            sa.Column("entity_type", sa.String(length=50), nullable=True),
            sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
            *_ts(),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_notifications_user_id", "notifications", ["user_id"])

    res_cols = {c["name"] for c in inspect(bind).get_columns("resource_reservations")}
    if "referral_id" not in res_cols:
        op.add_column("resource_reservations", sa.Column("referral_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            "fk_resource_reservations_referral_id", "resource_reservations", "referrals", ["referral_id"], ["id"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())

    if "resource_reservations" in tables:
        res_cols = {c["name"] for c in inspect(bind).get_columns("resource_reservations")}
        if "referral_id" in res_cols:
            op.drop_constraint("fk_resource_reservations_referral_id", "resource_reservations", type_="foreignkey")
            op.drop_column("resource_reservations", "referral_id")

    for table in ["notifications", "transport_events", "referral_status_history", "referrals"]:
        if table in tables:
            op.drop_table(table)

    ARRIVAL_CONDITION.drop(bind, checkfirst=True)
    REFERRAL_STATUS.drop(bind, checkfirst=True)
