"""add receiving-side feedback & counter-referral to referrals

Adds ``feedback_data`` (Referral Feedback) and ``counter_referral_data``
(Counter-Referral), JSON maps filled at the receiving facility. Written with
IF NOT EXISTS so it is safe to re-run.

Revision ID: 0004_feedback
Revises: 0003_monitoring
Create Date: 2026-06-28
"""
from alembic import op

revision = "0004_feedback"
down_revision = "0003_monitoring"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS feedback_data JSON")
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS counter_referral_data JSON")


def downgrade() -> None:
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS counter_referral_data")
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS feedback_data")
