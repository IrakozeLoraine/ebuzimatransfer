"""
Seed script — populates the database with realistic test data.
Run from the backend/ directory:
    python seeds.py           # seeds only if the database is empty (first time only)
    python seeds.py --force   # wipes existing data and re-seeds
"""
import asyncio
import sys

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import Role, User, UserRole, AccountStatus
from app.models.facility import Facility


# ---------------------------------------------------------------------------
# Data definitions
# ---------------------------------------------------------------------------

FACILITIES = [
    {
        "name": "University Teaching Hospital of Kigali (CHUK)",
        "type": "NRH_UTH",
        "location": "KN 4 Ave, Kigali",
        "province": "Kigali City",
        "district": "Nyarugenge",
    },
    {
        "name": "King Faisal Hospital Kigali",
        "type": "NRH_UTH",
        "location": "KG 544 St, Kigali",
        "province": "Kigali City",
        "district": "Gasabo",
    },
    {
        "name": "Rwanda Military Hospital (RMH)",
        "type": "LEVEL_TWO",
        "location": "KK 737 St, Kigali",
        "province": "Kigali City",
        "district": "Kicukiro",
    },
    {
        "name": "Butaro District Hospital",
        "type": "DISTRICT",
        "location": "Burera District",
        "province": "Northern Province",
        "district": "Burera",
    },
    {
        "name": "Ruhengeri Referral Hospital",
        "type": "LEVEL_TWO",
        "location": "Musanze District",
        "province": "Northern Province",
        "district": "Musanze",
    },
]

# facility_indices: list of facility indexes the user belongs to (empty = global/no facility)
USERS = [
    {
        "medical_id": "SA-0001",
        "email": "superadmin@ebuzimatransfer.rw",
        "first_name": "System",
        "last_name": "Admin",
        "phone": "+250788000001",
        "password": "Admin@1234",
        "roles": [UserRole.SUPER_ADMIN],
        "facility_indices": [],
    },
    {
        "medical_id": "FA-CHUK-001",
        "email": "admin.chuk@ebuzimatransfer.rw",
        "first_name": "Celestin",
        "last_name": "Habineza",
        "phone": "+250788000007",
        "password": "Admin@1234",
        "roles": [UserRole.FACILITY_ADMIN],
        "facility_indices": [0],  # CHUK
    },
    {
        "medical_id": "FA-KFH-001",
        "email": "admin.kfh@ebuzimatransfer.rw",
        "first_name": "Solange",
        "last_name": "Mukagasana",
        "phone": "+250788000008",
        "password": "Admin@1234",
        "roles": [UserRole.FACILITY_ADMIN],
        "facility_indices": [1],  # King Faisal
    },
    {
        "medical_id": "IC-CHUK-001",
        "email": "coordinator.chuk@ebuzimatransfer.rw",
        "first_name": "Amina",
        "last_name": "Uwimana",
        "phone": "+250788000002",
        "password": "Pass@1234",
        "roles": [UserRole.ICU_COORDINATOR],
        "facility_indices": [0],  # CHUK
    },
    {
        "medical_id": "IC-KFH-001",
        "email": "coordinator.kfh@ebuzimatransfer.rw",
        "first_name": "Jean",
        "last_name": "Habimana",
        "phone": "+250788000003",
        "password": "Pass@1234",
        "roles": [UserRole.ICU_COORDINATOR],
        "facility_indices": [1],  # King Faisal
    },
    {
        "medical_id": "RC-CHUK-001",
        "email": "clinician.chuk@ebuzimatransfer.rw",
        "first_name": "Diane",
        "last_name": "Mukamana",
        "phone": "+250788000004",
        "password": "Pass@1234",
        "roles": [UserRole.REFERRING_CLINICIAN],
        "facility_indices": [0],  # CHUK
    },
    {
        "medical_id": "RC-BUT-001",
        "email": "clinician.butaro@ebuzimatransfer.rw",
        "first_name": "Patrick",
        "last_name": "Nzeyimana",
        "phone": "+250788000005",
        "password": "Pass@1234",
        "roles": [UserRole.REFERRING_CLINICIAN],
        "facility_indices": [3],  # Butaro
    },
    {
        "medical_id": "AC-RWA-001",
        "email": "ambulance@ebuzimatransfer.rw",
        "first_name": "Eric",
        "last_name": "Bizimana",
        "phone": "+250788000006",
        "password": "Pass@1234",
        "roles": [UserRole.AMBULANCE_COORDINATOR],
        "facility_indices": [],
    },
]


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------

async def clear_data(session: AsyncSession) -> None:
    for table in [
        "user_facilities",
        "user_roles",
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


async def seed_facilities(session: AsyncSession) -> list[Facility]:
    facilities: list[Facility] = []
    for data in FACILITIES:
        f = Facility(**data)
        session.add(f)
        facilities.append(f)
    await session.flush()
    print(f"  ✓ Created {len(facilities)} facilities")
    return facilities

async def seed_users(
    session: AsyncSession,
    roles_map: dict[str, Role],
    facilities: list[Facility],
) -> list[User]:
    users: list[User] = []
    for data in USERS:
        user = User(
            email=data["email"],
            medical_id=data["medical_id"],
            first_name=data["first_name"],
            last_name=data["last_name"],
            phone=data["phone"],
            password_hash=hash_password(data["password"]),
            is_active=True,
            account_status=AccountStatus.ACTIVE.value,
            roles=[roles_map[r] for r in data["roles"]],
            facilities=[facilities[i] for i in data["facility_indices"]],
        )
        session.add(user)
        users.append(user)
    await session.flush()
    print(f"  ✓ Created {len(users)} users")
    return users

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def already_seeded(session: AsyncSession) -> bool:
    count = await session.scalar(select(func.count()).select_from(User))
    return bool(count)


async def main() -> None:
    force = "--force" in sys.argv

    print("\n🌱 Seeding eBuzimaTransfer database...\n")
    async with AsyncSessionLocal() as session:
        if not force and await already_seeded(session):
            print("  ↪ Data already present — skipping seed (use --force to reset).\n")
            return
        await clear_data(session)
        roles = await seed_roles(session)
        facilities = await seed_facilities(session)
        users = await seed_users(session, roles, facilities)
        await session.commit()

    print("\n✅ Seed complete!\n")
    print("Test credentials (login with medical_id):")
    for u in USERS:
        print(f"  {u['medical_id']:<20}  {u['email']:<50}  password: {u['password']}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
