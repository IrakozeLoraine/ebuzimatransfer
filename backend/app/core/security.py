import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Tuple
from jose import JWTError, jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from app.core.config import settings

ph = PasswordHasher()


def hash_password(plain: str) -> str:
    return ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def hash_device_key(plain: str) -> str:
    """Hash a device API key for storage/lookup.

    Device keys are high-entropy random tokens (unlike passwords), so a fast,
    deterministic SHA-256 is both safe and queryable by equality — letting us
    authenticate a device in a single indexed lookup.
    """
    return hashlib.sha256(plain.encode()).hexdigest()


def generate_device_key() -> Tuple[str, str]:
    """Return a (plaintext, hash) pair for a new device. Plaintext is shown once."""
    plain = "dev_" + secrets.token_urlsafe(32)
    return plain, hash_device_key(plain)


def _create_token(data: Dict[str, Any], expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(
    sub: str, roles: list[str], active_facility_id: str | None = None
) -> str:
    return _create_token(
        {
            "sub": sub,
            "roles": roles,
            "active_facility_id": active_facility_id,
            "type": "access",
        },
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
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
