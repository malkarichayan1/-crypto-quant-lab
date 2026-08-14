# src/hedgefund/api/rate_limit.py
from __future__ import annotations

import time
from collections import defaultdict

from fastapi import HTTPException, Request

# In-memory fixed-window limiter. Render's free tier runs a single process,
# so a module-level dict is sufficient — no Redis needed for one low-traffic
# endpoint. Resets on process restart; that's fine for abuse mitigation, not
# billing-grade accuracy.
_WINDOW_SECONDS = 3600
_MAX_REQUESTS = 5
_hits: dict[str, list[float]] = defaultdict(list)


def _client_ip(request: Request) -> str:
    """The real visitor IP, trusting Render's reverse proxy.

    Render terminates the visitor's TLS connection at its edge and forwards
    the request internally, so request.client.host is Render's proxy on
    every request — not the visitor. Render sets X-Forwarded-For with the
    original client as the leftmost entry (appending its own hop after),
    so we read that when present. Falls back to request.client.host for
    local dev and tests, where no such header exists.
    """
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(request: Request) -> None:
    """FastAPI dependency: raises 429 if the caller's IP has made
    _MAX_REQUESTS or more requests within the trailing _WINDOW_SECONDS."""
    client_host = _client_ip(request)
    now = time.monotonic()
    recent = [t for t in _hits[client_host] if now - t < _WINDOW_SECONDS]
    if len(recent) >= _MAX_REQUESTS:
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
    recent.append(now)
    _hits[client_host] = recent
