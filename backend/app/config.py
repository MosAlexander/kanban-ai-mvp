from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    session_secret_key: str = "dev-secret-key-change-me"
    hardcoded_username: str = "пользователь"
    hardcoded_password: str = "пароль"
    openai_api_key: str = ""
    model: str = "openai/gpt-5-mini"

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        extra="ignore",
    )


settings = Settings()
