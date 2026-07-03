"""Unit tests for settings-derived behaviour."""
from app.core.config import Settings


def _settings(**overrides):
    base = dict(
        DATABASE_URL="postgresql+asyncpg://t:t@localhost/t",
        SECRET_KEY="x",
    )
    base.update(overrides)
    return Settings(**base)


class TestOrigins:
    def test_splits_comma_separated_origins(self):
        s = _settings(ALLOWED_ORIGINS="http://a.com,http://b.com")
        assert s.origins == ["http://a.com", "http://b.com"]

    def test_strips_surrounding_whitespace(self):
        s = _settings(ALLOWED_ORIGINS="http://a.com , http://b.com ")
        assert s.origins == ["http://a.com", "http://b.com"]

    def test_single_origin(self):
        s = _settings(ALLOWED_ORIGINS="http://only.com")
        assert s.origins == ["http://only.com"]
