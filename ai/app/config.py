from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 8092
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_timeout_ms: int = 45_000
    diagnose_mode: str = "auto"
    # Default: sibling server/knowledge/runbooks when running from labs/loglens/ai
    knowledge_dir: str = str(
        Path(__file__).resolve().parents[2] / "server" / "knowledge" / "runbooks"
    )


settings = Settings()
