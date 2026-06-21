"""clinical unit catalog: turn ``units`` into a global, tier-scoped catalog

Previously ``units`` was per-facility with a free ``type`` (ICU|HDU). This
migration repurposes it into the global catalog of clinical unit types managed
by the super admin: each row carries a ``tier`` (the facility tier at which the
unit is introduced) and cascades upward to higher-tier facilities.

Steps: add ``tier``/``code``/``is_active``; seed the 4-tier catalog (editable
data); repoint existing resources that pointed at old ICU/HDU units to the
seeded ``ICU_HDU`` row; drop the old per-facility unit rows and the
``facility_id``/``type`` columns.
"""
import uuid
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0003_clinical_unit_catalog"
down_revision = "0002_resource_inventory"
branch_labels = None
depends_on = None


# (tier, code, name) — initial catalog data; fully editable by the super admin.
CATALOG: list[tuple[str, str, str]] = [
    # Tier 1 — Health Centers & Health Posts
    ("HEALTH_CENTER_POST", "OPD", "Outpatient Department (OPD)"),
    ("HEALTH_CENTER_POST", "MATERNITY_ANC", "Maternity & Antenatal Care (ANC) Unit"),
    ("HEALTH_CENTER_POST", "NEONATAL_UNDER5", "Neonatal & Under-5 Care Unit"),
    ("HEALTH_CENTER_POST", "INFECTIOUS_CCC", "Infectious Diseases / Comprehensive Care Unit (HIV/TB)"),
    ("HEALTH_CENTER_POST", "NCD_CLINIC", "Non-Communicable Diseases (NCD) Clinic"),
    ("HEALTH_CENTER_POST", "COMMUNITY_HEALTH", "Community Health Integration Unit"),
    # Tier 2 — District Hospitals
    ("DISTRICT", "AE", "Accident & Emergency (A&E) Unit"),
    ("DISTRICT", "GENERAL_SURGERY", "General Surgery Unit"),
    ("DISTRICT", "OBS_GYN", "Obstetrics & Gynecology (Obs/Gyn) Unit"),
    ("DISTRICT", "PEDIATRICS_NUTRITION", "Pediatrics & Nutrition Rehabilitation Unit"),
    ("DISTRICT", "NEONATOLOGY", "Neonatology Unit"),
    ("DISTRICT", "INTERNAL_MEDICINE", "Internal Medicine Unit"),
    ("DISTRICT", "MENTAL_HEALTH", "Mental Health Clinic"),
    ("DISTRICT", "ISANGE", "Isange One Stop Center"),
    ("DISTRICT", "ALLIED_HEALTH", "Allied Health Professional Units (Dental, Ophthalmology, Physiotherapy)"),
    # Tier 3 — Provincial & Referral Hospitals
    ("LEVEL_TWO", "ORTHOPEDICS", "Orthopedics & Traumatology Unit"),
    ("LEVEL_TWO", "ICU_HDU", "Intensive Care Unit (ICU) & High Dependency Unit (HDU)"),
    ("LEVEL_TWO", "SPEC_INTERNAL_MEDICINE", "Specialized Internal Medicine Units"),
    ("LEVEL_TWO", "SPEC_SURGERY", "Specialized Surgery Units"),
    ("LEVEL_TWO", "NICU", "Advanced Neonatal Intensive Care Unit (NICU)"),
    ("LEVEL_TWO", "MEDICAL_IMAGING", "Medical Imaging & Advanced Diagnostics Unit"),
    # Tier 4 — National Referral & University Teaching Hospitals
    ("NRH_UTH", "NEUROSURGERY", "Neurosurgery Unit"),
    ("NRH_UTH", "CARDIOTHORACIC", "Cardiothoracic Surgery Unit"),
    ("NRH_UTH", "ONCOLOGY_HEMATOLOGY", "Oncology & Hematology Unit"),
    ("NRH_UTH", "RENAL_DIALYSIS", "Renal & Dialysis Center"),
    ("NRH_UTH", "PLASTIC_RECONSTRUCTIVE", "Plastic & Reconstructive Surgery Unit"),
    ("NRH_UTH", "NEUROPSYCHIATRIC", "Neuropsychiatric Unit"),
    ("NRH_UTH", "PEDIATRIC_SURGERY", "Pediatric Surgery Unit"),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "units" not in set(inspector.get_table_names()):
        return

    columns = {c["name"] for c in inspector.get_columns("units")}

    # 1. New catalog columns; relax old constraints so seed rows can be inserted.
    if "tier" not in columns:
        op.add_column("units", sa.Column("tier", sa.String(length=50), nullable=True))
    if "code" not in columns:
        op.add_column("units", sa.Column("code", sa.String(length=50), nullable=True))
    if "is_active" not in columns:
        op.add_column(
            "units",
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        )
    op.alter_column("units", "name", existing_type=sa.String(length=100), type_=sa.String(length=150))
    if "facility_id" in columns:
        op.alter_column("units", "facility_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    if "type" in columns:
        op.alter_column("units", "type", existing_type=sa.String(length=10), nullable=True)

    # 2. Seed the catalog (editable data).
    units_tbl = sa.table(
        "units",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String),
        sa.column("code", sa.String),
        sa.column("tier", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    rows = [
        {"id": uuid.uuid4(), "name": name, "code": code, "tier": tier, "is_active": True}
        for (tier, code, name) in CATALOG
    ]
    op.bulk_insert(units_tbl, rows)
    icu_hdu_id = next(r["id"] for r in rows if r["code"] == "ICU_HDU")

    # 3. Repoint resources off old per-facility unit rows BEFORE deleting them
    #    (the resources.unit_id FK is ON DELETE CASCADE). Old units were only
    #    ever ICU/HDU, so they all map to the seeded ICU_HDU catalog row.
    if "facility_id" in columns:
        op.execute(
            sa.text(
                "UPDATE resources SET unit_id = :icu WHERE unit_id IN "
                "(SELECT id FROM units WHERE facility_id IS NOT NULL)"
            ).bindparams(icu=icu_hdu_id)
        )
        # 4. Remove old per-facility unit rows and the obsolete columns.
        op.execute("DELETE FROM units WHERE facility_id IS NOT NULL")
        op.drop_column("units", "facility_id")
    if "type" in columns:
        op.drop_column("units", "type")

    # 5. Tier is now populated for every row.
    op.alter_column("units", "tier", existing_type=sa.String(length=50), nullable=False)
    op.alter_column("units", "is_active", server_default=None, existing_type=sa.Boolean())


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "units" not in set(inspector.get_table_names()):
        return
    columns = {c["name"] for c in inspector.get_columns("units")}

    if "type" not in columns:
        op.add_column("units", sa.Column("type", sa.String(length=10), nullable=True))
    if "facility_id" not in columns:
        op.add_column("units", sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            "units_facility_id_fkey", "units", "facilities", ["facility_id"], ["id"], ondelete="CASCADE"
        )
    # Catalog rows have no facility; drop them.
    op.execute("DELETE FROM units WHERE facility_id IS NULL")
    for col in ("is_active", "code", "tier"):
        if col in columns:
            op.drop_column("units", col)
