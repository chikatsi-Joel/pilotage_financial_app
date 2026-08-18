from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "personal-finance-pilotage-api"
    environment: str = "development"
    database_url: str = "postgresql+asyncpg://finance:finance@localhost:5432/finance"
    cors_origins: list[str] = ["http://localhost:3000"]
    analytics_lookback_months: int = 6
    min_history_months_for_baseline: int = 3
    attention_deviation_threshold: float = 0.20
    strong_deviation_threshold: float = 0.50

    # Opportunity score weights (should sum to 1.0)
    weight_saving: float = 0.45
    weight_persistent: float = 0.35
    weight_anomaly: float = 0.20

    ollama_base_url: str = "https://api.ollama.com"
    ollama_model: str = "gemma4:31b"
    ollama_timeout: float = 60.0
    ollama_api_key: str = "e2aa3375e8e34b75926e5715e3bf0329.GjnBZJucM-tmSCfP4QiTFzES"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value):
        if isinstance(value, str):
            return [x.strip() for x in value.split(",") if x.strip()]
        return value


settings = Settings()
