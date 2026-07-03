"""Unit tests for password hashing and JWT token helpers."""
import re
from datetime import timedelta

import pytest
from jose import jwt

from app.core import security
from app.core.config import settings


class TestPasswordHashing:
    def test_hash_is_not_plaintext(self):
        hashed = security.hash_password("s3cret-pass")
        assert hashed != "s3cret-pass"
        assert hashed.startswith("$argon2")

    def test_verify_accepts_correct_password(self):
        hashed = security.hash_password("correct horse")
        assert security.verify_password("correct horse", hashed) is True

    def test_verify_rejects_wrong_password(self):
        hashed = security.hash_password("correct horse")
        assert security.verify_password("wrong horse", hashed) is False

    def test_verify_rejects_malformed_hash(self):
        # A non-argon2 string must not raise, just return False.
        assert security.verify_password("anything", "not-a-real-hash") is False

    def test_hash_is_salted_and_unique_per_call(self):
        a = security.hash_password("same")
        b = security.hash_password("same")
        assert a != b
        assert security.verify_password("same", a)
        assert security.verify_password("same", b)


class TestGeneratePassword:
    def test_default_shape(self):
        pw = security.generate_password()
        # Three dash-separated blocks of four characters: "Xy7k-9Qmn-aa3T".
        assert re.fullmatch(r"[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}", pw)

    def test_custom_shape(self):
        pw = security.generate_password(blocks=4, block_size=5)
        parts = pw.split("-")
        assert len(parts) == 4
        assert all(len(p) == 5 for p in parts)

    def test_excludes_lookalike_characters(self):
        # Generate many and assert none contain ambiguous glyphs.
        joined = "".join(security.generate_password() for _ in range(200)).replace("-", "")
        for ch in "0O1lI":
            assert ch not in joined

    def test_values_are_random(self):
        assert security.generate_password() != security.generate_password()


class TestTokens:
    def test_access_token_roundtrip(self):
        token = security.create_access_token(
            sub="user-123", roles=["CLINICIAN"], active_facility_id="fac-1"
        )
        payload = security.decode_token(token)
        assert payload["sub"] == "user-123"
        assert payload["roles"] == ["CLINICIAN"]
        assert payload["active_facility_id"] == "fac-1"
        assert payload["type"] == "access"
        assert "exp" in payload

    def test_access_token_without_facility(self):
        token = security.create_access_token(sub="u", roles=[])
        payload = security.decode_token(token)
        assert payload["active_facility_id"] is None

    def test_driver_token_type(self):
        token = security.create_driver_token("amb-9")
        payload = security.decode_token(token)
        assert payload["sub"] == "amb-9"
        assert payload["type"] == "driver"

    def test_refresh_token_type(self):
        payload = security.decode_token(security.create_refresh_token("u"))
        assert payload["type"] == "refresh"

    def test_password_reset_token_type(self):
        payload = security.decode_token(security.create_password_reset_token("u"))
        assert payload["type"] == "password_reset"

    def test_decode_rejects_garbage(self):
        assert security.decode_token("not.a.jwt") == {}

    def test_decode_rejects_wrong_secret(self):
        forged = jwt.encode(
            {"sub": "attacker", "type": "access"},
            "a-different-secret",
            algorithm=settings.JWT_ALGORITHM,
        )
        assert security.decode_token(forged) == {}

    def test_decode_rejects_expired_token(self):
        expired = security._create_token(
            {"sub": "u", "type": "access"}, timedelta(minutes=-1)
        )
        assert security.decode_token(expired) == {}
