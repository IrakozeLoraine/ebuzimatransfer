"""add MoH form-variant fields to referrals

Adds ``form_type`` (which Rwanda MoH transfer-form variant was used) and
``form_data`` (a JSON map of the form-specific field values) to the referrals
table. Written with IF NOT EXISTS so it is safe to run against a database where
the columns may already exist.

Revision ID: 0002_form_type
Revises: 0001_dictation
Create Date: 2026-06-27
"""
from alembic import op

revision = "0002_form_type"
down_revision = "0001_dictation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE referrals ADD COLUMN IF NOT EXISTS form_type VARCHAR(20) NOT NULL DEFAULT 'EXTERNAL'"
    )
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS form_data JSON")


def downgrade() -> None:
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS form_data")
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS form_type")
