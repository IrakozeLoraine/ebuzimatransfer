"""keep every driver-recorded transport monitoring

Replaces the single ``transport_monitoring`` JSON map with ``transport_monitorings``,
a JSON array holding every Patient Monitoring Transfer Form the driver records
during a transport (oldest first). Any existing single record is wrapped into a
one-element array so no monitoring is lost. Written with IF (NOT) EXISTS so it is
safe to re-run.

Revision ID: 0005_monitoring_history
Revises: 0004_feedback
Create Date: 2026-07-07
"""
from alembic import op

revision = "0005_monitoring_history"
down_revision = "0004_feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS transport_monitorings JSON")
    # Preserve any recording made before this change as the first entry of the list.
    op.execute(
        "UPDATE referrals SET transport_monitorings = json_build_array(transport_monitoring) "
        "WHERE transport_monitoring IS NOT NULL AND transport_monitorings IS NULL"
    )
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS transport_monitoring")


def downgrade() -> None:
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS transport_monitoring JSON")
    # Fall back to the most recent recording for the single-value column.
    op.execute(
        "UPDATE referrals SET transport_monitoring = "
        "transport_monitorings->(json_array_length(transport_monitorings) - 1) "
        "WHERE transport_monitorings IS NOT NULL AND json_array_length(transport_monitorings) > 0"
    )
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS transport_monitorings")
