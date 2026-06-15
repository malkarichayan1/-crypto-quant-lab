from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from hedgefund.api.config import get_settings

_engine = create_engine(get_settings().database_url, future=True)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a session and closing it afterward."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
