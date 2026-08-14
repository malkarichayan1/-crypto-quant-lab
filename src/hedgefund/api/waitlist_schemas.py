# src/hedgefund/api/waitlist_schemas.py
from __future__ import annotations

from pydantic import BaseModel, EmailStr


class WaitlistRequest(BaseModel):
    email: EmailStr
    # Honeypot: hidden from real users via CSS on the frontend form. Any
    # non-empty value here means an automated submitter filled every field
    # it could find — the route accepts it (200) but stores nothing.
    company: str = ""


class WaitlistResponse(BaseModel):
    status: str
