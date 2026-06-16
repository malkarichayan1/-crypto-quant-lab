from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

_DEFAULT_DB_URL = "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund"


class Settings:
    def __init__(
        self,
        database_url: str,
        anthropic_api_key: str | None,
        anthropic_model: str,
    ) -> None:
        self.database_url = database_url
        self.anthropic_api_key = anthropic_api_key
        self.anthropic_model = anthropic_model


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL", _DEFAULT_DB_URL),
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"),
        anthropic_model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
    )
