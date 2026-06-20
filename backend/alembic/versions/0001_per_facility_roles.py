"""per-facility roles: replace user_roles + user_facilities with user_facility_roles

Revision ID: 0001_per_facility_roles
Revises:
Create Date: 2026-06-20

Roles were previously global (``user_roles``) with separate facility membership
(``user_facilities``). This migration introduces ``user_facility_roles`` which
grants a role to a user *within a facility* (a NULL facility = a global grant,
e.g. SUPER_ADMIN), migrates the existing data, then drops the two old tables.
"""
import uuid
from collections import defaultdict

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0001_per_facility_roles"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_facility_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "facility_id", "role_id", name="uq_user_facility_role"),
    )
    op.create_index("ix_user_facility_roles_user_id", "user_facility_roles", ["user_id"])
    op.create_index("ix_user_facility_roles_facility_id", "user_facility_roles", ["facility_id"])

    _migrate_data_forward()

    op.drop_table("user_facilities")
    op.drop_table("user_roles")


def _migrate_data_forward() -> None:
    """Combine global roles (user_roles) with facility membership (user_facilities)
    into per-facility grants. Users with roles but no facility get a global (NULL) grant."""
    conn = op.get_bind()
    role_rows = conn.execute(sa.text("SELECT user_id, role_id FROM user_roles")).fetchall()
    fac_rows = conn.execute(sa.text("SELECT user_id, facility_id FROM user_facilities")).fetchall()

    facilities_by_user: dict = defaultdict(list)
    for user_id, facility_id in fac_rows:
        facilities_by_user[str(user_id)].append(facility_id)

    insert = sa.text(
        "INSERT INTO user_facility_roles (id, user_id, facility_id, role_id) "
        "VALUES (:id, :user_id, :facility_id, :role_id)"
    )
    for user_id, role_id in role_rows:
        facilities = facilities_by_user.get(str(user_id))
        targets = facilities if facilities else [None]
        for facility_id in targets:
            conn.execute(
                insert,
                {
                    "id": str(uuid.uuid4()),
                    "user_id": str(user_id),
                    "facility_id": str(facility_id) if facility_id is not None else None,
                    "role_id": str(role_id),
                },
            )


def downgrade() -> None:
    op.create_table(
        "user_roles",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "role_id"),
    )
    op.create_table(
        "user_facilities",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "facility_id"),
    )

    conn = op.get_bind()
    # Rebuild the global role list and facility membership (deduplicated) from the grants.
    conn.execute(
        sa.text(
            "INSERT INTO user_roles (user_id, role_id) "
            "SELECT DISTINCT user_id, role_id FROM user_facility_roles"
        )
    )
    conn.execute(
        sa.text(
            "INSERT INTO user_facilities (user_id, facility_id) "
            "SELECT DISTINCT user_id, facility_id FROM user_facility_roles "
            "WHERE facility_id IS NOT NULL"
        )
    )

    op.drop_table("user_facility_roles")
