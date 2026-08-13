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


def rate_limit(request: Request) -> None:
    """FastAPI dependency: raises 429 if the caller's IP has made
    _MAX_REQUESTS or more requests within the trailing _WINDOW_SECONDS."""
    client_host = request.client.host if request.client else "unknown"
    now = time.monotonic()
    recent = [t for t in _hits[client_host] if now - t < _WINDOW_SECONDS]
    if len(recent) >= _MAX_REQUESTS:
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
    recent.append(now)
    _hits[client_host] = recent
