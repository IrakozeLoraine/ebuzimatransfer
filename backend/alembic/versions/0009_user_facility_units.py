"""per-facility clinical unit membership for clinicians

Replaces the single global ``users.unit_id`` with a ``user_facility_units``
association so a clinician can work in multiple units, scoped per facility.
Existing ``users.unit_id`` values are backfilled: the unit is attached to every
facility the user already belongs to.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision = "0009_user_facility_units"
down_revision = "0008_ambulance_tracking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())

    if "user_facility_units" not in tables:
        op.create_table(
            "user_facility_units",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("unit_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["unit_id"], ["units.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("user_id", "facility_id", "unit_id", name="uq_user_facility_unit"),
        )
        op.create_index("ix_user_facility_units_user_id", "user_facility_units", ["user_id"])
        op.create_index("ix_user_facility_units_facility_id", "user_facility_units", ["facility_id"])

    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "unit_id" in cols:
        # Backfill: attach each user's existing global unit to every facility they
        # belong to (distinct, via their role grants).
        op.execute(
            """
            INSERT INTO user_facility_units (id, user_id, facility_id, unit_id)
            SELECT gen_random_uuid(), ufr.user_id, ufr.facility_id, u.unit_id
            FROM users u
            JOIN user_facility_roles ufr ON ufr.user_id = u.id
            WHERE u.unit_id IS NOT NULL AND ufr.facility_id IS NOT NULL
            GROUP BY ufr.user_id, ufr.facility_id, u.unit_id
            ON CONFLICT ON CONSTRAINT uq_user_facility_unit DO NOTHING
            """
        )
        op.drop_column("users", "unit_id")


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "unit_id" not in cols:
        op.add_column("users", sa.Column("unit_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            "users_unit_id_fkey", "users", "units", ["unit_id"], ["id"]
        )

    tables = set(inspect(bind).get_table_names())
    if "user_facility_units" in tables:
        op.drop_table("user_facility_units")
