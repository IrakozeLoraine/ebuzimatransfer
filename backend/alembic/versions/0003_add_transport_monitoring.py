"""add driver-recorded transport monitoring to referrals

Adds ``transport_monitoring`` (a JSON map holding the ambulance driver's
voice-recorded Patient Monitoring Transfer Form — recording URL, transcript,
summary, vital-signs and problem log) to the referrals table. Written with
IF NOT EXISTS so it is safe to re-run.

Revision ID: 0003_monitoring
Revises: 0002_form_type
Create Date: 2026-06-27
"""
from alembic import op

revision = "0003_monitoring"
down_revision = "0002_form_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS transport_monitoring JSON")


def downgrade() -> None:
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS transport_monitoring")
