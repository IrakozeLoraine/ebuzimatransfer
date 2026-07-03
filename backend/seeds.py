"""
Seed script — bootstraps a fresh database with the bare minimum to log in.

It creates the role rows and a single **Super Admin** account. Everything else
(facilities, users, resources, transfer requests, GPS trackers, …) is meant to be
created through the app.

"""
import asyncio
import sys

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import Role, User, UserRole, UserFacilityRole, AccountStatus
from app.models.location import Location


# ---------------------------------------------------------------------------
# Data definitions
# ---------------------------------------------------------------------------

# The one and only seeded account. The super admin signs in and builds out the
# rest of the platform (facilities, staff, capacity, …) from the UI.
SUPER_ADMIN = {
    "medical_id": "SA-0001",
    "email": "superadmin@ebuzimatransfer.rw",
    "first_name": "System",
    "last_name": "Admin",
    "phone": "+250788000001",
    "password": "Admin@1234",
}


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------

async def clear_data(session: AsyncSession) -> None:
    """Wipe every table so --force re-seeds onto a clean slate. Order respects
    foreign keys (children before parents)."""
    for table in [
        "locations",
        "in_app_calls",
        "call_logs",
        "facility_phone_lines",
        "resource_reservations",
        "referral_status_history",
        "ambulance_location_pings",
        "transport_events",
        "ambulances",
        "notifications",
        "resources",
        "referrals",
        "user_facility_units",
        "user_facility_roles",
        "units",
        "users",
        "facilities",
        "roles",
    ]:
        await session.execute(text(f"DELETE FROM {table}"))
    await session.commit()
    print("  ✓ Cleared existing data")


async def seed_roles(session: AsyncSession) -> dict[str, Role]:
    roles: dict[str, Role] = {}
    for name in UserRole.ALL:
        role = Role(name=name)
        session.add(role)
        roles[name] = role
    await session.flush()
    print(f"  ✓ Created {len(roles)} roles")
    return roles


async def seed_super_admin(session: AsyncSession, roles_map: dict[str, Role]) -> User:
    """Create the single SUPER_ADMIN. The role is granted globally (facility_id
    is NULL) — a super admin is not scoped to any one facility."""
    user = User(
        email=SUPER_ADMIN["email"],
        medical_id=SUPER_ADMIN["medical_id"],
        first_name=SUPER_ADMIN["first_name"],
        last_name=SUPER_ADMIN["last_name"],
        phone=SUPER_ADMIN["phone"],
        password_hash=hash_password(SUPER_ADMIN["password"]),
        is_active=True,
        account_status=AccountStatus.ACTIVE.value,
        facility_roles=[UserFacilityRole(role=roles_map[UserRole.SUPER_ADMIN], facility=None)],
    )
    session.add(user)
    await session.flush()
    print("  ✓ Created super admin")
    return user


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

# Administrative-hierarchy levels, top → bottom, matching Location.level.
_LOCATION_LEVELS = ["PROVINCE", "DISTRICT", "SECTOR", "CELL", "VILLAGE"]


async def _insert_location(session: AsyncSession, name: str, level_idx: int, parent_id, value) -> None:
    """Insert one location node and recurse into its children. ``value`` is a dict
    (keyed children), a list (leaf village names), or empty (no deeper data)."""
    loc = Location(name=name, level=_LOCATION_LEVELS[level_idx], parent_id=parent_id)
    session.add(loc)
    await session.flush()
    if isinstance(value, dict):
        for child_name, child_value in value.items():
            await _insert_location(session, child_name, level_idx + 1, loc.id, child_value)
    elif isinstance(value, list):
        for village in value:
            await _insert_location(session, village, level_idx + 1, loc.id, {})


async def seed_locations(session: AsyncSession) -> None:
    """Seed the Rwanda administrative hierarchy into the database (idempotent — skips
    if any locations already exist). The source data lives in
    ``app.data.rwanda_locations`` and is loaded into the ``locations`` table so the
    app queries the database, not the in-code dict."""
    count = await session.scalar(select(func.count()).select_from(Location))
    if count:
        print("  ↪ Locations already present — skipping location seed")
        return
    from app.data.rwanda_locations import LOCATIONS

    for province, districts in LOCATIONS.items():
        await _insert_location(session, province, 0, None, districts)
    await session.commit()
    print("  ✓ Seeded locations")


async def already_seeded(session: AsyncSession) -> bool:
    count = await session.scalar(select(func.count()).select_from(User))
    return bool(count)


async def ensure_schema(reset: bool) -> None:
    """Build the schema directly from the models.

    The drop reflects the *live* database rather than the current models, so tables
    from a renamed/removed model (e.g. an old ``ambulance_devices``) are dropped too —
    otherwise their foreign keys would block dropping the tables they point at.
    """
    import app.models  # noqa: F401 — register every table on Base.metadata
    from app.db.base import Base
    from app.db.session import engine
    from sqlalchemy import MetaData, text

    async with engine.begin() as conn:
        if reset:
            existing = MetaData()
            await conn.run_sync(existing.reflect)
            await conn.run_sync(existing.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        if reset:
            await conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
    print(f"  ✓ Schema ready ({'drop_all + create_all' if reset else 'create_all'})")


async def main() -> None:
    force = "--force" in sys.argv

    print("\n🌱 Seeding eBuzimaTransfer database...\n")
    await ensure_schema(reset=force)
    # Locations are reference data — seed them on every run (idempotent), independent
    # of whether the demo accounts already exist.
    async with AsyncSessionLocal() as session:
        await seed_locations(session)
    async with AsyncSessionLocal() as session:
        if not force and await already_seeded(session):
            print("  ↪ Data already present — skipping seed (use --force to reset).\n")
            return
        # --force already gave us empty tables via drop+recreate; clear_data is a
        # harmless no-op there, and the safety net for a first-time (non-force) seed.
        await clear_data(session)
        roles = await seed_roles(session)
        await seed_super_admin(session, roles)
        await session.commit()

    print("\n✅ Seed complete!\n")
    print("Super admin login (use the Medical ID):")
    print(f"  {SUPER_ADMIN['medical_id']:<12}  {SUPER_ADMIN['email']:<40}  password: {SUPER_ADMIN['password']}")
    print("\nEverything else is built from the app — see DEMO_GUIDE.md.\n")


if __name__ == "__main__":
    asyncio.run(main())
