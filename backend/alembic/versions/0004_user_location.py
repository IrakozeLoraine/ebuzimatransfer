"""user location: add an optional free-text location to users

Adds a nullable ``users.location`` column so users can record where they are
based (e.g. for self-service profile updates).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "0004_user_location"
down_revision = "0003_clinical_unit_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "location" not in cols:
        op.add_column("users", sa.Column("location", sa.String(length=255), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "location" in cols:
        op.drop_column("users", "location")
