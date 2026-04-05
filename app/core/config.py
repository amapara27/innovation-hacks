"""Environment-backed configuration for the FastAPI service."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    use_openai_narrator: bool
    openai_api_key: str | None
    openai_base_url: str
    openai_model: str
    request_timeout_seconds: float


def load_settings() -> Settings:
    return Settings(
        use_openai_narrator=_env_flag("CARBONIQ_USE_OPENAI_NARRATOR", default=False),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        openai_model=os.getenv("CARBONIQ_OPENAI_MODEL", "gpt-5-mini"),
        request_timeout_seconds=float(os.getenv("CARBONIQ_HTTP_TIMEOUT_SECONDS", "10")),
    )


settings = load_settings()
