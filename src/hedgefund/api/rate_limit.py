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
    every request — not the visitor. Render *appends* its own observed hop
    to X-Forwarded-For rather than resetting the header, and never
    validates or strips whatever the client sent beforehand — so everything
    except the rightmost entry is attacker-suppliable. We trust only the
    rightmost entry: the one hop our own infrastructure actually observed.
    (This mirrors what uvicorn's ProxyHeadersMiddleware does: peel off
    exactly as many hops from the right as there are trusted proxies in
    front of you — one, here.) Falls back to request.client.host for local
    dev and tests, where no such header exists.
    """
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[-1].strip()
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
