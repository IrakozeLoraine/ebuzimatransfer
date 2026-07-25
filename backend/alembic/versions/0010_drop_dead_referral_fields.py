"""drop dead referral columns

Six columns on ``referrals`` are no longer collected anywhere — they were dropped
from the transfer forms, are absent from every request/response schema, and are
never read. ``age_band``/``acuity_level``/``urgency`` were only ever written as
empty strings on draft creation; ``comorbidities``/``ventilator_needed``/
``high_flow_oxygen_needed`` are never populated (resource needs are captured via
``requested_resources`` instead). This drops them from the running schema.
Written with IF (NOT) EXISTS so it is safe to re-run.

Revision ID: 0010_drop_dead_referral_fields
Revises: 0009_monitoring_history
Create Date: 2026-07-25
"""
from alembic import op

revision = "0010_drop_dead_referral_fields"
down_revision = "0009_monitoring_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS age_band")
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS acuity_level")
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS urgency")
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS comorbidities")
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS ventilator_needed")
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS high_flow_oxygen_needed")


def downgrade() -> None:
    # Re-add with the original constraints/defaults so existing rows stay valid.
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS age_band VARCHAR(20) NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS acuity_level VARCHAR(20) NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS urgency VARCHAR(20) NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS comorbidities VARCHAR(500)")
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS ventilator_needed BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS high_flow_oxygen_needed BOOLEAN NOT NULL DEFAULT FALSE")
