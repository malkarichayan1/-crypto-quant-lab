# src/hedgefund/api/db/waitlist_repository.py
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from hedgefund.api.db.waitlist_models import WaitlistSignupRow


class WaitlistRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add_email(self, email: str) -> None:
        """Idempotent: re-submitting an email already on the list is a
        silent no-op success, never a user-facing "already registered"
        leak."""
        normalized = email.strip().lower()
        existing = self._session.scalar(
            select(WaitlistSignupRow).where(WaitlistSignupRow.email == normalized)
        )
        if existing is not None:
            return
        self._session.add(WaitlistSignupRow(id=uuid.uuid4(), email=normalized))
