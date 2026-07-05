"""multiple requested resources per referral

Replaces the single ``referrals.requested_resource_id`` column with a
``referral_requested_resources`` join table so one request can ask for several
distinct resources at the destination (one unit of each), all reserved when the
request is accepted.

Existing single-resource requests are backfilled into the join table before the
old column is dropped. Written idempotently so it is safe to re-run.

Revision ID: 0007_requested_resources
Revises: 0006_drop_patient_code
Create Date: 2026-07-05
"""
from alembic import op

revision = "0007_requested_resources"
down_revision = "0006_drop_patient_code"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS referral_requested_resources (
            referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
            resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
            PRIMARY KEY (referral_id, resource_id)
        )
        """
    )
    # Backfill: carry every existing single requested resource into the join table.
    op.execute(
        """
        INSERT INTO referral_requested_resources (referral_id, resource_id)
        SELECT id, requested_resource_id
        FROM referrals
        WHERE requested_resource_id IS NOT NULL
        ON CONFLICT DO NOTHING
        """
    )
    op.execute("ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_requested_resource_id_fkey")
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS requested_resource_id")


def downgrade() -> None:
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
    # Collapse the set back to a single resource (the earliest-linked one) so the
    # restored column is populated for requests that had at least one resource.
    op.execute(
        """
        UPDATE referrals r
        SET requested_resource_id = sub.resource_id
        FROM (
            SELECT DISTINCT ON (referral_id) referral_id, resource_id
            FROM referral_requested_resources
            ORDER BY referral_id, resource_id
        ) AS sub
        WHERE sub.referral_id = r.id
        """
    )
    op.execute("DROP TABLE IF EXISTS referral_requested_resources")
