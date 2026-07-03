from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://10.110.9.42:5173"
    ENVIRONMENT: str = "development"

    # Redis backs the multi-worker WebSocket fan-out (pub/sub). Every worker
    # subscribes and re-broadcasts to its own local sockets.
    REDIS_URL: str = "redis://localhost:6379/0"
    # Self-hosted OSRM routing server (road distance/duration for ambulance ETAs).
    # In production point this at your own OSRM container loaded with Rwanda OSM
    # data; the public demo server is unsuitable for production traffic.
    OSRM_BASE_URL: str = "http://localhost:5000"

    # Voice-dictated referrals — fully open-source and offline-capable.
    # Self-hosted Whisper model size for speech-to-text. "small" balances accuracy
    # and CPU speed; use "medium"/"large-v3" if a GPU is available.
    WHISPER_MODEL_SIZE: str = "small"
    # Local Ollama extracts structured form fields + a summary from the transcript
    # using JSON-schema-constrained output. Runs entirely on your own machine —
    # no API key, no cost. Leave the base URL reachable or extraction degrades to
    # transcript-only.
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"
    # Where the kept recordings are stored on disk (served back via the API so the
    # receiving clinic can play them). Relative paths resolve from the backend cwd.
    MEDIA_ROOT: str = "media"

    @property
    def origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

settings = Settings()
