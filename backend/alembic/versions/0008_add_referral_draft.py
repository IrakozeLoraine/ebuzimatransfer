"""add DRAFT status and form_completed to referrals

Supports call-first "lightweight" referrals: a referral coordinated by phone can
be created with the bare minimum, sent straight to transport (bypassing the
in-app accept/reservation step), and have its full MoH transfer form completed
later. ``DRAFT`` is the pre-transport resting status for such a referral, and
``form_completed`` tracks whether the detailed form still needs finishing (it can
be completed even after the status has moved on to transport).

Written idempotently (``IF NOT EXISTS``) so it is safe to run against a database
where the changes may already exist.

Revision ID: 0008_referral_draft
Revises: 0007_requested_resources
Create Date: 2026-07-06
"""
from alembic import op

revision = "0008_referral_draft"
down_revision = "0007_requested_resources"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE must run outside a transaction block; the
    # autocommit block is Alembic's supported way to do that.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE referral_status ADD VALUE IF NOT EXISTS 'DRAFT'")
    op.execute(
        "ALTER TABLE referrals ADD COLUMN IF NOT EXISTS form_completed BOOLEAN NOT NULL DEFAULT TRUE"
    )


def downgrade() -> None:
    # Postgres cannot drop a single enum value, so only the column is reversed.
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS form_completed")
