from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str
    JWT_ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    REFRESH_TOKEN_EXPIRE_DAYS: int
    ALLOWED_ORIGINS: str
    ENVIRONMENT: str

    REDIS_URL: str
    OSRM_BASE_URL: str

    WHISPER_MODEL_SIZE: str
    OLLAMA_BASE_URL: str
    OLLAMA_MODEL: str
    MEDIA_ROOT: str

    @property
    def origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

settings = Settings()
