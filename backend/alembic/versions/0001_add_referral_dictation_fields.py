"""add voice-dictation fields to referrals

Adds the kept recording URL, the speech-to-text transcript, and the AI summary
to the referrals table. Written with IF NOT EXISTS so it is safe to run against a
database where the columns may already exist.

Revision ID: 0001_dictation
Revises:
Create Date: 2026-06-27
"""
from alembic import op

revision = "0001_dictation"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS audio_url VARCHAR(500)")
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS transcript TEXT")
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS ai_summary TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS ai_summary")
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS transcript")
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS audio_url")
