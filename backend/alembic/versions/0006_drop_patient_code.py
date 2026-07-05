"""drop patient_code from referrals

The ``patient_code`` (serial number / EMR ID) field was removed from the transfer
forms and the model. This drops the now-unused column from the running schema.
Written with IF EXISTS so it is safe to re-run.

Revision ID: 0006_drop_patient_code
Revises: 0005_requested_resource
Create Date: 2026-07-04
"""
from alembic import op

revision = "0006_drop_patient_code"
down_revision = "0005_requested_resource"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE referrals DROP COLUMN IF EXISTS patient_code")


def downgrade() -> None:
    # Re-add as non-null with an empty default so existing rows satisfy the constraint.
    op.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS patient_code VARCHAR(50) NOT NULL DEFAULT ''")
