from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    ENVIRONMENT: str = "development"

    # Redis backs the multi-worker WebSocket fan-out (pub/sub). Every worker
    # subscribes and re-broadcasts to its own local sockets.
    REDIS_URL: str = "redis://localhost:6379/0"
    # Self-hosted OSRM routing server (road distance/duration for ambulance ETAs).
    # In production point this at your own OSRM container loaded with Rwanda OSM
    # data; the public demo server is unsuitable for production traffic.
    OSRM_BASE_URL: str = "http://localhost:5000"

    @property
    def origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

settings = Settings()
