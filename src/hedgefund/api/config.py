from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

_DEFAULT_DB_URL = "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund"


class Settings:
    """Process configuration read from environment variables."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url


@lru_cache
def get_settings() -> Settings:
    return Settings(database_url=os.environ.get("DATABASE_URL", _DEFAULT_DB_URL))
