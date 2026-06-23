"""
Seed script — populates the database with realistic test data.
Run from the backend/ directory:
    python seeds.py           # seeds only if the database is empty (first time only)
    python seeds.py --force   # wipes existing data and re-seeds
"""
import asyncio
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import Role, User, UserRole, UserFacilityRole, UserFacilityUnit, AccountStatus
from app.models.facility import Facility
from app.models.unit import Unit
from app.models.resource import Resource, ResourceReservation, ResourceStatus, ResourceType
from app.models.referral import Referral, ReferralStatus, ReferralStatusHistory
from app.models.call import FacilityPhoneLine, PhoneLineType
from app.models.transport import TransportEvent
from app.models.ambulance import AmbulanceLocationPing


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
        "roles": [UserRole.CLINICIAN],
        "facility_indices": [0],  # CHUK
    },
    {
        "medical_id": "IC-KFH-001",
        "email": "coordinator.kfh@ebuzimatransfer.rw",
        "first_name": "Jean",
        "last_name": "Habimana",
        "phone": "+250788000003",
        "password": "Pass@1234",
        "roles": [UserRole.CLINICIAN],
        "facility_indices": [1],  # King Faisal
    },
    {
        "medical_id": "RC-CHUK-001",
        "email": "clinician.chuk@ebuzimatransfer.rw",
        "first_name": "Diane",
        "last_name": "Mukamana",
        "phone": "+250788000004",
        "password": "Pass@1234",
        "roles": [UserRole.CLINICIAN],
        "facility_indices": [0],  # CHUK
    },
    {
        "medical_id": "RC-BUT-001",
        "email": "clinician.butaro@ebuzimatransfer.rw",
        "first_name": "Patrick",
        "last_name": "Nzeyimana",
        "phone": "+250788000005",
        "password": "Pass@1234",
        "roles": [UserRole.CLINICIAN],
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


# Resources reference a facility (by name) and a clinical unit (by name). The unit
# must be available at the facility's tier — the cascading catalog already enforces
# this; these specs respect it. Status is spread across the lifecycle so the
# capacity dashboard shows a realistic mix.
CHUK = "University Teaching Hospital of Kigali (CHUK)"
KFH = "King Faisal Hospital Kigali"
RMH = "Rwanda Military Hospital (RMH)"
BUTARO = "Butaro District Hospital"
RUHENGERI = "Ruhengeri Referral Hospital"

ICU_HDU = "Intensive Care Unit (ICU) & High Dependency Unit (HDU)"

RESOURCES = [
    # CHUK — NRH_UTH
    {"facility": CHUK, "unit": ICU_HDU, "name": "Maquet Servo-i Invasive Ventilator", "code": "CHUK-ICU-MV-01", "type": ResourceType.MECHANICAL_VENTILATION, "qty": 4, "status": ResourceStatus.AVAILABLE},
    {"facility": CHUK, "unit": ICU_HDU, "name": "Hamilton-C6 Ventilator", "code": "CHUK-ICU-MV-02", "type": ResourceType.MECHANICAL_VENTILATION, "qty": 3, "status": ResourceStatus.OCCUPIED},
    {"facility": CHUK, "unit": "Renal & Dialysis Center", "name": "Fresenius 4008S Dialysis Machine", "code": "CHUK-RD-RRT-01", "type": ResourceType.ACUTE_RENAL_REPLACEMENT_THERAPY, "qty": 5, "status": ResourceStatus.AVAILABLE},
    {"facility": CHUK, "unit": "Medical Imaging & Advanced Diagnostics Unit", "name": "Siemens SOMATOM CT Scanner", "code": "CHUK-IMG-CT-01", "type": ResourceType.CT_SCANS_MRI, "qty": 1, "status": ResourceStatus.OCCUPIED},
    {"facility": CHUK, "unit": "Neurosurgery Unit", "name": "Neurosurgical Theatre Suite", "code": "CHUK-NS-NE-01", "type": ResourceType.NEUROLOGICAL_EMERGENCIES, "qty": 2, "status": ResourceStatus.RESERVED},

    # King Faisal — NRH_UTH
    {"facility": KFH, "unit": ICU_HDU, "name": "GE CARESCAPE R860 Ventilator", "code": "KFH-ICU-MV-01", "type": ResourceType.MECHANICAL_VENTILATION, "qty": 6, "status": ResourceStatus.AVAILABLE},
    {"facility": KFH, "unit": ICU_HDU, "name": "Bedside Hemodynamic Monitor", "code": "KFH-ICU-HM-01", "type": ResourceType.INVASIVE_HEMODYNAMIC_MONITORING, "qty": 8, "status": ResourceStatus.OCCUPIED},
    {"facility": KFH, "unit": "Cardiothoracic Surgery Unit", "name": "Cardiac Operating Theatre", "code": "KFH-CT-ES-01", "type": ResourceType.EMERGENCY_SURGERY, "qty": 2, "status": ResourceStatus.AVAILABLE},
    {"facility": KFH, "unit": "Renal & Dialysis Center", "name": "Nikkiso Dialysis Station", "code": "KFH-RD-RRT-01", "type": ResourceType.ACUTE_RENAL_REPLACEMENT_THERAPY, "qty": 4, "status": ResourceStatus.OUT_OF_SERVICE},

    # Rwanda Military Hospital — LEVEL_TWO
    {"facility": RMH, "unit": ICU_HDU, "name": "Dräger Evita V300 Ventilator", "code": "RMH-ICU-MV-01", "type": ResourceType.MECHANICAL_VENTILATION, "qty": 3, "status": ResourceStatus.AVAILABLE},
    {"facility": RMH, "unit": ICU_HDU, "name": "High-Flow Oxygen Therapy Unit", "code": "RMH-ICU-ARS-01", "type": ResourceType.ADVANCED_RESPIRATORY_SUPPORT, "qty": 5, "status": ResourceStatus.OCCUPIED},
    {"facility": RMH, "unit": "Orthopedics & Traumatology Unit", "name": "Orthopedic Trauma Theatre", "code": "RMH-OT-ES-01", "type": ResourceType.EMERGENCY_SURGERY, "qty": 1, "status": ResourceStatus.AVAILABLE},
    {"facility": RMH, "unit": "Medical Imaging & Advanced Diagnostics Unit", "name": "Philips Ingenia MRI Scanner", "code": "RMH-IMG-CT-01", "type": ResourceType.CT_SCANS_MRI, "qty": 1, "status": ResourceStatus.RESERVED},

    # Butaro District Hospital — DISTRICT
    {"facility": BUTARO, "unit": "Accident & Emergency (A&E) Unit", "name": "Emergency Bay Transport Ventilator", "code": "BUT-AE-MV-01", "type": ResourceType.MECHANICAL_VENTILATION, "qty": 2, "status": ResourceStatus.AVAILABLE},
    {"facility": BUTARO, "unit": "General Surgery Unit", "name": "General Surgical Theatre", "code": "BUT-GS-ES-01", "type": ResourceType.EMERGENCY_SURGERY, "qty": 1, "status": ResourceStatus.OCCUPIED},
    {"facility": BUTARO, "unit": "Internal Medicine Unit", "name": "Vasopressor Infusion Pumps", "code": "BUT-IM-VI-01", "type": ResourceType.VASOPRESSOR_INOTROPE_INFUSIONS, "qty": 6, "status": ResourceStatus.AVAILABLE},
    {"facility": BUTARO, "unit": "Neonatology Unit", "name": "Neonatal Respiratory Support Unit", "code": "BUT-NEO-ARS-01", "type": ResourceType.ADVANCED_RESPIRATORY_SUPPORT, "qty": 3, "status": ResourceStatus.AVAILABLE},

    # Ruhengeri Referral Hospital — LEVEL_TWO
    {"facility": RUHENGERI, "unit": ICU_HDU, "name": "ICU Ventilator (Mindray SV300)", "code": "RUH-ICU-MV-01", "type": ResourceType.MECHANICAL_VENTILATION, "qty": 2, "status": ResourceStatus.AVAILABLE},
    {"facility": RUHENGERI, "unit": ICU_HDU, "name": "Invasive Hemodynamic Monitor", "code": "RUH-ICU-HM-01", "type": ResourceType.INVASIVE_HEMODYNAMIC_MONITORING, "qty": 4, "status": ResourceStatus.OCCUPIED},
    {"facility": RUHENGERI, "unit": "Specialized Surgery Units", "name": "Specialized Operating Theatre", "code": "RUH-SS-ES-01", "type": ResourceType.EMERGENCY_SURGERY, "qty": 1, "status": ResourceStatus.AVAILABLE},
    {"facility": RUHENGERI, "unit": "Advanced Neonatal Intensive Care Unit (NICU)", "name": "NICU Ventilator", "code": "RUH-NICU-ARS-01", "type": ResourceType.ADVANCED_RESPIRATORY_SUPPORT, "qty": 3, "status": ResourceStatus.RESERVED},
]

# Reservations give the dashboard "Recent Activity" feed some interactions.
# (resource code, requesting clinician's medical_id, hours until planned admission)
RESERVATIONS = [
    ("CHUK-NS-NE-01", "RC-BUT-001", 6),
    ("RMH-IMG-CT-01", "RC-CHUK-001", 12),
    ("RUH-NICU-ARS-01", "RC-BUT-001", 3),
]


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------

async def clear_data(session: AsyncSession) -> None:
    for table in [
        "call_logs",
        "facility_phone_lines",
        "resource_reservations",
        "referral_status_history",
        "ambulance_location_pings",
        "transport_events",
        "notifications",
        "resources",
        "referrals",
        "user_facility_units",
        "user_facility_roles",
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
        # Build per-facility role grants. An empty facility_indices list means the
        # role is granted globally (facility_id is NULL) — e.g. SUPER_ADMIN.
        grants: list[UserFacilityRole] = []
        for role_name in data["roles"]:
            role = roles_map[role_name]
            if data["facility_indices"]:
                for i in data["facility_indices"]:
                    grants.append(UserFacilityRole(role=role, facility=facilities[i]))
            else:
                grants.append(UserFacilityRole(role=role, facility=None))

        user = User(
            email=data["email"],
            medical_id=data["medical_id"],
            first_name=data["first_name"],
            last_name=data["last_name"],
            phone=data["phone"],
            password_hash=hash_password(data["password"]),
            is_active=True,
            account_status=AccountStatus.ACTIVE.value,
            facility_roles=grants,
        )
        session.add(user)
        users.append(user)
    await session.flush()
    print(f"  ✓ Created {len(users)} users")
    return users

async def seed_resources(session: AsyncSession) -> None:
    """Seed clinical resources (and a few reservations). Idempotent: skips if any
    resources already exist. Resolves facilities/units/users from the DB by name,
    so it works on top of an already-seeded database."""
    existing = await session.scalar(select(func.count()).select_from(Resource))
    if existing:
        print(f"  ↪ {existing} resources already present — skipping resource seed.")
        return

    fac_by_name = {f.name: f for f in (await session.execute(select(Facility))).scalars()}
    unit_by_name = {u.name: u for u in (await session.execute(select(Unit))).scalars()}
    user_by_mid = {u.medical_id: u for u in (await session.execute(select(User))).scalars()}

    by_code: dict[str, Resource] = {}
    for spec in RESOURCES:
        facility = fac_by_name.get(spec["facility"])
        unit = unit_by_name.get(spec["unit"])
        if facility is None or unit is None:
            print(f"  ⚠ Skipping {spec['code']}: missing facility/unit")
            continue
        resource = Resource(
            resource_name=spec["name"],
            resource_code=spec["code"],
            resource_type=spec["type"],
            quantity=spec["qty"],
            status=spec["status"],
            facility_id=facility.id,
            unit_id=unit.id,
        )
        session.add(resource)
        by_code[spec["code"]] = resource
    await session.flush()
    print(f"  ✓ Created {len(by_code)} resources")

    now = datetime.now(timezone.utc)
    reservations = 0
    for code, medical_id, hours in RESERVATIONS:
        resource = by_code.get(code)
        requester = user_by_mid.get(medical_id)
        if resource is None or requester is None:
            continue
        session.add(ResourceReservation(
            resource_id=resource.id,
            reserved_by=requester.id,
            planned_admission_time=now + timedelta(hours=hours),
        ))
        reservations += 1
    await session.flush()
    print(f"  ✓ Created {reservations} reservations")


# Per-facility clinical-unit membership for the seeded clinicians
# (medical_id -> list of (facility, unit) the clinician works in). A clinician can
# work in several units, scoped per facility — RC-CHUK-001 covers two CHUK units.
CLINICIAN_UNITS = {
    "RC-BUT-001": [(BUTARO, "Accident & Emergency (A&E) Unit")],
    "RC-CHUK-001": [(CHUK, ICU_HDU), (CHUK, "Neurosurgery Unit")],
    "IC-CHUK-001": [(CHUK, ICU_HDU)],
    "IC-KFH-001": [(KFH, ICU_HDU)],
}

TRANSFERS = [
    {"created_by": "RC-BUT-001", "from": BUTARO, "to": CHUK, "origin_unit": "Accident & Emergency (A&E) Unit",
     "requested_unit": ICU_HDU, "patient_code": "PT-0001", "age_band": "ADULT", "sex": "M",
     "diagnosis": "Severe traumatic brain injury", "acuity_level": "HIGH", "urgency": "IMMEDIATE",
     "reason": "Needs neuro-ICU and ventilation", "vent": True, "status": ReferralStatus.REQUESTED},
    {"created_by": "RC-BUT-001", "from": BUTARO, "to": KFH, "origin_unit": "Accident & Emergency (A&E) Unit",
     "requested_unit": ICU_HDU, "patient_code": "PT-0002", "age_band": "ADULT", "sex": "F",
     "diagnosis": "Septic shock", "acuity_level": "HIGH", "urgency": "URGENT",
     "reason": "ICU bed + vasopressors", "vent": True, "status": ReferralStatus.ACCEPTED},
    {"created_by": "RC-BUT-001", "from": BUTARO, "to": CHUK, "origin_unit": "Accident & Emergency (A&E) Unit",
     "requested_unit": ICU_HDU, "patient_code": "PT-0003", "age_band": "PEDIATRIC", "sex": "M",
     "diagnosis": "Status epilepticus", "acuity_level": "MEDIUM", "urgency": "URGENT",
     "reason": "Pediatric ICU", "vent": False, "status": ReferralStatus.REJECTED,
     "rejection_reason": "No pediatric ICU bed available"},
    {"created_by": "RC-BUT-001", "from": BUTARO, "to": CHUK, "origin_unit": "Accident & Emergency (A&E) Unit",
     "requested_unit": ICU_HDU, "patient_code": "PT-0004", "age_band": "ADULT", "sex": "M",
     "diagnosis": "Acute myocardial infarction", "acuity_level": "HIGH", "urgency": "IMMEDIATE",
     "reason": "Cath lab + coronary ICU", "vent": False, "status": ReferralStatus.EN_ROUTE},
]


# Institutional/department call lines per facility (label, number, type). SAMU
# national ambulance dispatch (912) is added to every facility.
PHONE_LINES = {
    CHUK: [
        ("ER Main Reception", "0786828253", PhoneLineType.EMERGENCY),
        ("Emergency Team", "+250731117822", PhoneLineType.EMERGENCY),
    ],
    KFH: [
        ("Toll-free Emergency", "3939", PhoneLineType.TOLLFREE),
        ("International / Mobile", "+250788123200", PhoneLineType.COORDINATION),
        ("Night Supervisor", "0788530351", PhoneLineType.SUPERVISOR),
    ],
    RMH: [
        ("Toll-free Line", "4060", PhoneLineType.TOLLFREE),
    ],
    BUTARO: [
        ("DH Emergency Coordination", "0783849767", PhoneLineType.COORDINATION),
    ],
    RUHENGERI: [
        ("DH Coordination", "0785061888", PhoneLineType.COORDINATION),
    ],
}
SAMU_DISPATCH = ("SAMU Ambulance Dispatch", "912", PhoneLineType.DISPATCH)


# Approximate GPS coordinates (lat, lng) for the seeded facilities.
FACILITY_COORDS = {
    CHUK: (-1.9706, 30.0588),
    KFH: (-1.9437, 30.1126),
    RMH: (-1.9920, 30.1056),
    BUTARO: (-1.4561, 29.8419),
    RUHENGERI: (-1.4997, 29.6336),
}


async def seed_coords(session: AsyncSession) -> None:
    """Set facility GPS coordinates (idempotent — always reasserted)."""
    fac_by_name = {f.name: f for f in (await session.execute(select(Facility))).scalars()}
    n = 0
    for name, (lat, lng) in FACILITY_COORDS.items():
        fac = fac_by_name.get(name)
        if fac:
            fac.latitude, fac.longitude = lat, lng
            n += 1
    await session.flush()
    print(f"  ✓ Set coordinates for {n} facilities")


async def seed_phone_lines(session: AsyncSession) -> None:
    """Seed institutional call lines per facility. Idempotent: skips if any exist."""
    existing = await session.scalar(select(func.count()).select_from(FacilityPhoneLine))
    if existing:
        print(f"  ↪ {existing} phone lines already present — skipping.")
        return
    fac_by_name = {f.name: f for f in (await session.execute(select(Facility))).scalars()}
    count = 0
    for fac_name, lines in PHONE_LINES.items():
        fac = fac_by_name.get(fac_name)
        if not fac:
            continue
        for label, number, line_type in [*lines, SAMU_DISPATCH]:
            session.add(FacilityPhoneLine(facility_id=fac.id, label=label, phone_number=number, line_type=line_type))
            count += 1
    await session.flush()
    print(f"  ✓ Created {count} institutional phone lines")


# In-transit ambulance for the EN_ROUTE transfer — drives the live tracking map.
# (patient_code of the referral it serves, vehicle, driver, coordinator medical_id)
AMBULANCE = {
    "patient_code": "PT-0004",
    "ambulance_identifier": "RAD 432 H",
    "driver_name": "Theogene Niyonzima",
    "driver_phone": "+250788111432",
    "coordinator_mid": "AC-RWA-001",
    "origin": BUTARO,
    "destination": CHUK,
}


async def seed_ambulance(session: AsyncSession) -> None:
    """Seed an in-transit ambulance: a transport event plus a GPS trail running
    from the origin facility toward the destination (~60% of the way there) so the
    live tracking map has data. Idempotent: skips if any location pings exist."""
    existing = await session.scalar(select(func.count()).select_from(AmbulanceLocationPing))
    if existing:
        print(f"  ↪ {existing} ambulance pings already present — skipping.")
        return

    referral = await session.scalar(
        select(Referral).where(Referral.patient_code == AMBULANCE["patient_code"])
    )
    coordinator = await session.scalar(
        select(User).where(User.medical_id == AMBULANCE["coordinator_mid"])
    )
    if referral is None or coordinator is None:
        print("  ⚠ No EN_ROUTE referral / coordinator found — skipping ambulance seed.")
        return

    now = datetime.now(timezone.utc)
    session.add(TransportEvent(
        referral_id=referral.id,
        ambulance_identifier=AMBULANCE["ambulance_identifier"],
        driver_name=AMBULANCE["driver_name"],
        driver_phone=AMBULANCE["driver_phone"],
        dispatch_time=now - timedelta(minutes=70),
        pickup_time=now - timedelta(minutes=55),
        departure_time=now - timedelta(minutes=50),
        created_by=coordinator.id,
    ))

    (o_lat, o_lng) = FACILITY_COORDS[AMBULANCE["origin"]]
    (d_lat, d_lng) = FACILITY_COORDS[AMBULANCE["destination"]]
    steps = 8          # number of pings
    progress = 0.6     # fraction of the route already covered
    for i in range(steps + 1):
        frac = progress * i / steps
        # Slight lateral wiggle so the trail doesn't look like a ruler line.
        jitter = 0.004 * (1 if i % 2 else -1) * (i / steps)
        session.add(AmbulanceLocationPing(
            referral_id=referral.id,
            latitude=round(o_lat + (d_lat - o_lat) * frac + jitter, 5),
            longitude=round(o_lng + (d_lng - o_lng) * frac, 5),
            reported_by=coordinator.id,
            recorded_at=now - timedelta(minutes=round(50 * (1 - i / steps))),
        ))
    print(f"  ✓ Created 1 transport event + {steps + 1} ambulance pings")


async def seed_transfers(session: AsyncSession) -> None:
    """Assign clinicians a clinical unit and seed sample transfer requests.
    Idempotent: skips request creation if any already exist."""
    fac_by_name = {f.name: f for f in (await session.execute(select(Facility))).scalars()}
    unit_by_name = {u.name: u for u in (await session.execute(select(Unit))).scalars()}
    user_by_mid = {u.medical_id: u for u in (await session.execute(select(User))).scalars()}

    # Per-facility clinical-unit membership (idempotent — replace existing rows).
    member_ids = [user_by_mid[mid].id for mid in CLINICIAN_UNITS if mid in user_by_mid]
    if member_ids:
        await session.execute(
            delete(UserFacilityUnit).where(UserFacilityUnit.user_id.in_(member_ids))
        )
    memberships = 0
    for mid, units in CLINICIAN_UNITS.items():
        user = user_by_mid.get(mid)
        if not user:
            continue
        for fac_name, unit_name in units:
            fac = fac_by_name.get(fac_name)
            unit = unit_by_name.get(unit_name)
            if fac and unit:
                session.add(UserFacilityUnit(user_id=user.id, facility_id=fac.id, unit_id=unit.id))
                memberships += 1
    await session.flush()
    print(f"  ✓ Assigned {memberships} unit memberships to {len(CLINICIAN_UNITS)} clinicians")

    existing = await session.scalar(select(func.count()).select_from(Referral))
    if existing:
        print(f"  ↪ {existing} transfer requests already present — skipping.")
        return

    year = datetime.now(timezone.utc).year
    for i, t in enumerate(TRANSFERS, start=1):
        creator = user_by_mid.get(t["created_by"])
        frm = fac_by_name.get(t["from"])
        to = fac_by_name.get(t["to"])
        if not creator or not frm or not to:
            continue
        ref = Referral(
            referral_number=f"REF-{year}-{i:05d}",
            patient_code=t["patient_code"],
            age_band=t["age_band"],
            sex=t["sex"],
            diagnosis=t["diagnosis"],
            acuity_level=t["acuity_level"],
            urgency=t["urgency"],
            reason_for_transfer=t["reason"],
            ventilator_needed=t.get("vent", False),
            high_flow_oxygen_needed=False,
            status=t["status"],
            rejection_reason=t.get("rejection_reason"),
            created_by=creator.id,
            referring_facility_id=frm.id,
            preferred_facility_id=to.id,
            accepted_facility_id=to.id if t["status"] in (
                ReferralStatus.ACCEPTED, ReferralStatus.EN_ROUTE, ReferralStatus.ARRIVED
            ) else None,
            origin_unit_id=unit_by_name[t["origin_unit"]].id if t["origin_unit"] in unit_by_name else None,
            requested_unit_id=unit_by_name[t["requested_unit"]].id if t["requested_unit"] in unit_by_name else None,
        )
        session.add(ref)
        await session.flush()
        # Status history: always a REQUESTED entry, plus the terminal one.
        session.add(ReferralStatusHistory(referral_id=ref.id, status=ReferralStatus.REQUESTED, changed_by=creator.id))
        if t["status"] != ReferralStatus.REQUESTED:
            session.add(ReferralStatusHistory(referral_id=ref.id, status=t["status"], changed_by=creator.id))
    await session.flush()
    print(f"  ✓ Created {len(TRANSFERS)} transfer requests")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def already_seeded(session: AsyncSession) -> bool:
    count = await session.scalar(select(func.count()).select_from(User))
    return bool(count)


async def main() -> None:
    force = "--force" in sys.argv

    # Seed only resources on top of existing data.
    if "--resources" in sys.argv:
        print("\n🌱 Seeding resources...\n")
        async with AsyncSessionLocal() as session:
            await seed_resources(session)
            await session.commit()
        print("\n✅ Resource seed complete!\n")
        return

    # Seed only transfer requests (+ clinician unit membership) on top of existing data.
    if "--transfers" in sys.argv:
        print("\n🌱 Seeding transfer requests...\n")
        async with AsyncSessionLocal() as session:
            await seed_transfers(session)
            await session.commit()
        print("\n✅ Transfer-request seed complete!\n")
        return

    # Set facility coordinates on top of existing data.
    if "--coords" in sys.argv:
        print("\n🌱 Setting facility coordinates...\n")
        async with AsyncSessionLocal() as session:
            await seed_coords(session)
            await session.commit()
        print("\n✅ Coordinates set!\n")
        return

    # Seed only institutional phone lines on top of existing data.
    if "--phone-lines" in sys.argv:
        print("\n🌱 Seeding institutional phone lines...\n")
        async with AsyncSessionLocal() as session:
            await seed_phone_lines(session)
            await session.commit()
        print("\n✅ Phone-line seed complete!\n")
        return

    # Seed only the in-transit ambulance (transport event + GPS trail) on top of existing data.
    if "--ambulance" in sys.argv:
        print("\n🌱 Seeding in-transit ambulance...\n")
        async with AsyncSessionLocal() as session:
            await seed_ambulance(session)
            await session.commit()
        print("\n✅ Ambulance seed complete!\n")
        return

    print("\n🌱 Seeding eBuzimaTransfer database...\n")
    async with AsyncSessionLocal() as session:
        if not force and await already_seeded(session):
            print("  ↪ Data already present — skipping seed (use --force to reset).\n")
            return
        await clear_data(session)
        roles = await seed_roles(session)
        facilities = await seed_facilities(session)
        users = await seed_users(session, roles, facilities)
        await seed_coords(session)
        await seed_resources(session)
        await seed_transfers(session)
        await seed_phone_lines(session)
        await seed_ambulance(session)
        await session.commit()

    print("\n✅ Seed complete!\n")
    print("Test credentials (login with medical_id):")
    for u in USERS:
        print(f"  {u['medical_id']:<20}  {u['email']:<50}  password: {u['password']}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
