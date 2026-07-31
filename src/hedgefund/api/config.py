from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

_DEFAULT_DB_URL = "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund"
_DEFAULT_CORS_ORIGINS = ["http://localhost:5173"]


class Settings:
    def __init__(
        self,
        database_url: str,
        anthropic_api_key: str | None,
        anthropic_model: str,
        cors_origins: list[str] | None = None,
        paper_tick_interval_seconds: int = 60,
        paper_fetch_lookback_bars: int = 1000,
    ) -> None:
        self.database_url = database_url
        self.anthropic_api_key = anthropic_api_key
        self.anthropic_model = anthropic_model
        self.cors_origins = cors_origins if cors_origins is not None else _DEFAULT_CORS_ORIGINS
        self.paper_tick_interval_seconds = paper_tick_interval_seconds
        self.paper_fetch_lookback_bars = paper_fetch_lookback_bars


def _parse_cors_origins(raw: str | None) -> list[str]:
    if not raw:
        return _DEFAULT_CORS_ORIGINS
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or _DEFAULT_CORS_ORIGINS


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL", _DEFAULT_DB_URL),
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"),
        anthropic_model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
        cors_origins=_parse_cors_origins(os.environ.get("CORS_ORIGINS")),
        paper_tick_interval_seconds=int(os.environ.get("PAPER_TICK_INTERVAL_SECONDS", "60")),
        paper_fetch_lookback_bars=int(os.environ.get("PAPER_FETCH_LOOKBACK_BARS", "1000")),
    )
