"""add requested_resource_id to referrals

Adds ``requested_resource_id`` — the specific resource the requester asks for at
the destination facility (validated as available up front). The model gained this
column but no migration created it, so inserts fail with UndefinedColumnError.
Written with IF NOT EXISTS so it is safe to re-run.

Revision ID: 0005_requested_resource
Revises: 0004_feedback
Create Date: 2026-07-03
"""
from alembic import op

revision = "0005_requested_resource"
down_revision = "0004_feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS requested_resource_id UUID")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'referrals_requested_resource_id_fkey'
            ) THEN
                ALTER TABLE referrals
                    ADD CONSTRAINT referrals_requested_resource_id_fkey
                    FOREIGN KEY (requested_resource_id) REFERENCES resources(id);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_requested_resource_id_fkey")
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS requested_resource_id")