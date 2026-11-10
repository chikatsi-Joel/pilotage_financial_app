from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "lucia-api"
    environment: str = "development"
    database_url: str = "postgresql+asyncpg://finance:finance@localhost:5432/finance"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:19000",
        "http://localhost:19006",
    ]
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
    ollama_vision_model: str = ""
    ollama_timeout: float = 60.0
    receipt_scan_max_bytes: int = 10 * 1024 * 1024
    ollama_api_key: str = ""

    # Serveur SMTP (vérification d'email). Vide = les emails sont écrits dans les logs.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_security: Literal["starttls", "ssl", "none"] = "starttls"
    smtp_timeout: float = 15.0

    # Notifications push (service gratuit d'Expo).
    push_enabled: bool = True
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    expo_access_token: str = ""
    push_timeout: float = 10.0
    # Tâche planifiée (rappel quotidien, résumé hebdomadaire) dans le processus de l'API.
    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 900

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value):
        if isinstance(value, str):
            return [x.strip() for x in value.split(",") if x.strip()]
        return value


settings = Settings()
