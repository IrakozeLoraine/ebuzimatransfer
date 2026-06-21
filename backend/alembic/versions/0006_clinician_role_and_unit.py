"""single clinician role + user clinical-unit membership

Merges the ``REFERRING_CLINICIAN`` and ``ICU_COORDINATOR`` roles into a single
``CLINICIAN`` role (referring vs receiving is derived from context), and adds
``users.unit_id`` so clinicians belong to a clinical unit (same-unit visibility).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0006_clinician_role_and_unit"
down_revision = "0005_transfer_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Add users.unit_id (nullable FK to units).
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "unit_id" not in cols:
        op.add_column("users", sa.Column("unit_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key("fk_users_unit_id", "users", "units", ["unit_id"], ["id"])

    # 2. Merge REFERRING_CLINICIAN + ICU_COORDINATOR -> CLINICIAN.
    op.execute(
        "UPDATE roles SET name='CLINICIAN' "
        "WHERE name='REFERRING_CLINICIAN' AND NOT EXISTS (SELECT 1 FROM roles WHERE name='CLINICIAN')"
    )
    op.execute(
        "UPDATE roles SET name='CLINICIAN' "
        "WHERE name='ICU_COORDINATOR' AND NOT EXISTS (SELECT 1 FROM roles WHERE name='CLINICIAN')"
    )
    # Drop old-role grants that would collide with an existing CLINICIAN grant.
    op.execute(
        "DELETE FROM user_facility_roles ufr "
        "WHERE ufr.role_id IN (SELECT id FROM roles WHERE name IN ('REFERRING_CLINICIAN','ICU_COORDINATOR')) "
        "AND EXISTS (SELECT 1 FROM user_facility_roles c JOIN roles cr ON cr.id=c.role_id "
        "  WHERE cr.name='CLINICIAN' AND c.user_id=ufr.user_id "
        "  AND c.facility_id IS NOT DISTINCT FROM ufr.facility_id)"
    )
    # Repoint remaining old-role grants to CLINICIAN, then remove the old roles.
    op.execute(
        "UPDATE user_facility_roles SET role_id=(SELECT id FROM roles WHERE name='CLINICIAN') "
        "WHERE role_id IN (SELECT id FROM roles WHERE name IN ('REFERRING_CLINICIAN','ICU_COORDINATOR'))"
    )
    op.execute("DELETE FROM roles WHERE name IN ('REFERRING_CLINICIAN','ICU_COORDINATOR')")


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "unit_id" in cols:
        op.drop_constraint("fk_users_unit_id", "users", type_="foreignkey")
        op.drop_column("users", "unit_id")
    # Role merge is not reversed (the original split is not recoverable).
