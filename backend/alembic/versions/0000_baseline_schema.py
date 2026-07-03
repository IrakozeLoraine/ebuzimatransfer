"""baseline schema — create all tables from the SQLAlchemy models

Revision ID: 0000_base
Revises:
Create Date: 2026-07-03

Historically the schema was created by ``Base.metadata.create_all`` (see
``seeds.py``), and the migrations that follow only ``ADD COLUMN`` onto an
assumed-existing schema. That works on a database that was already built by
``create_all``, but ``alembic upgrade head`` against an *empty* database (CI, or
a brand-new volume) has nothing to create the tables and fails on the first
``ALTER TABLE referrals``.

This baseline builds the whole schema from the current models so that
``alembic upgrade head`` works from an empty database. On a database that
already has the tables (e.g. the running production volume, already stamped at a
later revision) this migration is simply never re-run, and ``create_all`` is a
no-op anyway because it only creates missing tables.
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0000_base"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Import the models so every table is registered on ``Base.metadata`` before
    # we create them (this mirrors what ``alembic/env.py`` and ``seeds.py`` do).
    import app.models  # noqa: F401
    from app.db.base import Base

    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    import app.models  # noqa: F401
    from app.db.base import Base

    Base.metadata.drop_all(bind=op.get_bind())
