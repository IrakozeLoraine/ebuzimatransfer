"""Shared pytest fixtures and environment setup.

The suite has two layers:

* **Unit tests** exercise pure domain logic (security helpers, tier rules,
  model methods, routing math) without any database or network.
* **Integration tests** drive the real FastAPI app over ASGI against a live
  PostgreSQL database, so request/response wiring, dependency injection and
  SQLAlchemy models are all covered end-to-end.

We seed the environment before ``app.core.config`` is imported so that
``Settings()`` construction never depends on a developer's local ``.env``.
"""
import os
import uuid
from types import SimpleNamespace

import pytest
import pytest_asyncio

# Provide deterministic settings for the whole test session. Set before any
# ``app.*`` import triggers ``Settings()`` at module load time.
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test"
)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
os.environ.setdefault("REFRESH_TOKEN_EXPIRE_DAYS", "7")


# ---------------------------------------------------------------------------
# Integration-test infrastructure (database + ASGI client).
#
# Integration tests connect to a throwaway PostgreSQL database. Point them at
# one via ``TEST_DATABASE_URL``; if unset we fall back to ``DATABASE_URL`` so a
# local Postgres works out of the box. Tests are skipped cleanly when no
# database is reachable, keeping the pure unit tests runnable anywhere.
# ---------------------------------------------------------------------------
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL") or os.environ["DATABASE_URL"]


@pytest_asyncio.fixture
async def engine():
    """A fresh schema per test: create every table up front, drop it after.

    Keeping this function-scoped means each test runs against the same event
    loop pytest-asyncio creates for it, avoiding cross-loop engine issues.
    """
    from sqlalchemy.ext.asyncio import create_async_engine
    from app.db.base import Base
    import app.models  # noqa: F401 — registers all tables on Base.metadata

    eng = create_async_engine(TEST_DATABASE_URL, echo=False)
    try:
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    except Exception as exc:  # noqa: BLE001 — any connect failure → skip, don't error
        await eng.dispose()
        pytest.skip(f"No test database available: {exc}")

    yield eng

    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    from sqlalchemy.ext.asyncio import async_sessionmaker

    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session):
    """An httpx client bound to the app, with the DB dependency overridden to
    reuse the test's session so seeded data and requests share one database."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.db.session import get_session

    async def _override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = _override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def user_factory(db_session):
    """Create persisted users with roles at a facility.

    Returns an async callable so tests can spin up exactly the identities they
    need. Defaults produce an active CLINICIAN with a known password.
    """
    from sqlalchemy import select
    from app.core.security import hash_password
    from app.models.facility import Facility
    from app.models.user import User, Role, UserFacilityRole, AccountStatus

    async def _get_or_create_role(name: str) -> Role:
        existing = await db_session.scalar(select(Role).where(Role.name == name))
        if existing:
            return existing
        role = Role(name=name)
        db_session.add(role)
        await db_session.flush()
        return role

    async def _create(
        *,
        medical_id: str = "MED-100",
        password: str | None = "S3cret-pass",
        roles: tuple[str, ...] = ("CLINICIAN",),
        facility_name: str = "Kigali District Hospital",
        facility_type: str = "DISTRICT",
        account_status: str = AccountStatus.ACTIVE.value,
        is_active: bool = True,
    ):
        facility = Facility(name=facility_name, type=facility_type)
        db_session.add(facility)
        await db_session.flush()

        user = User(
            medical_id=medical_id,
            first_name="Test",
            last_name="User",
            password_hash=hash_password(password) if password else hash_password("x"),
            is_active=is_active,
            account_status=account_status,
        )
        db_session.add(user)
        await db_session.flush()

        for role_name in roles:
            role = await _get_or_create_role(role_name)
            db_session.add(
                UserFacilityRole(
                    user_id=user.id, facility_id=facility.id, role_id=role.id
                )
            )
        await db_session.commit()
        return user, facility

    return _create


@pytest_asyncio.fixture
async def make_auth(user_factory):
    """Create a persisted user with the given roles and return everything a test
    needs to make authenticated API calls as them: the user, their facility, and
    a ready-to-use ``Authorization`` header carrying a valid access token scoped
    to that facility.
    """
    from app.core.security import create_access_token

    counter = {"n": 0}

    async def _make(
        *,
        roles: tuple[str, ...] = ("SUPER_ADMIN",),
        medical_id: str | None = None,
        facility_name: str = "Auth Hospital",
        facility_type: str = "NRH_UTH",
        **kwargs,
    ):
        counter["n"] += 1
        mid = medical_id or f"MED-AUTH-{counter['n']}"
        user, facility = await user_factory(
            roles=roles,
            medical_id=mid,
            facility_name=f"{facility_name} {counter['n']}",
            facility_type=facility_type,
            **kwargs,
        )
        token = create_access_token(str(user.id), list(roles), str(facility.id))
        return SimpleNamespace(
            user=user,
            facility=facility,
            headers={"Authorization": f"Bearer {token}"},
        )

    return _make

def pytest_collection_modifyitems(config, items):
    for item in items:
        is_integration = item.path.name.startswith("test_integration_")
        item.add_marker("integration" if is_integration else "unit")
