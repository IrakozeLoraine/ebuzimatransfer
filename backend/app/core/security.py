import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict
from jose import JWTError, jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from app.core.config import settings

ph = PasswordHasher()

# Excludes look-alike characters (0/O, 1/l/I) so a password read off a screen or
# QR card can't be mistyped.
_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"


def generate_password(blocks: int = 3, block_size: int = 4) -> str:
    """A strong, human-readable password for ambulance driver logins, grouped into
    dash-separated blocks (e.g. ``Xy7k-9Qmn-aa3T``). The admin reveals it once and
    gives it to the driver — or, more conveniently, hands over the setup QR code."""
    raw = "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(blocks * block_size))
    return "-".join(raw[i : i + block_size] for i in range(0, len(raw), block_size))


def hash_password(plain: str) -> str:
    return ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def _create_token(data: Dict[str, Any], expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(
    sub: str,
    roles: list[str],
    active_facility_id: str | None = None,
    active_unit_id: str | None = None,
) -> str:
    return _create_token(
        {
            "sub": sub,
            "roles": roles,
            "active_facility_id": active_facility_id,
            "active_unit_id": active_unit_id,
            "type": "access",
        },
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_driver_token(ambulance_id: str) -> str:
    """A long-lived access token for an ambulance's driver app. The subject is the
    ambulance id; ``type: driver`` keeps it distinct from staff access tokens."""
    return _create_token(
        {"sub": ambulance_id, "type": "driver"},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def create_refresh_token(sub: str) -> str:
    return _create_token(
        {"sub": sub, "type": "refresh"},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def create_password_reset_token(sub: str) -> str:
    return _create_token(
        {"sub": sub, "type": "password_reset"},
        timedelta(minutes=30),
    )


def decode_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return {}
