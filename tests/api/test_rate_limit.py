# tests/api/test_rate_limit.py
from __future__ import annotations

import pytest
from fastapi import HTTPException, Request

from hedgefund.api.rate_limit import _hits, rate_limit


def make_request(ip: str, *, forwarded_for: str | None = None) -> Request:
    headers = []
    if forwarded_for is not None:
        headers.append((b"x-forwarded-for", forwarded_for.encode()))
    return Request({"type": "http", "client": (ip, 1234), "headers": headers})


@pytest.fixture(autouse=True)
def _clear_hits():
    _hits.clear()
    yield
    _hits.clear()


def test_allows_requests_under_the_limit():
    for _ in range(5):
        rate_limit(make_request("1.2.3.4"))  # should not raise


def test_blocks_the_6th_request_within_the_window():
    for _ in range(5):
        rate_limit(make_request("1.2.3.4"))
    with pytest.raises(HTTPException) as exc_info:
        rate_limit(make_request("1.2.3.4"))
    assert exc_info.value.status_code == 429


def test_tracks_ips_independently():
    for _ in range(5):
        rate_limit(make_request("1.1.1.1"))
    rate_limit(make_request("2.2.2.2"))  # different IP, should not raise


def test_uses_x_forwarded_for_when_present_instead_of_client_host():
    # Render terminates TLS at its edge and forwards internally, so every
    # request's request.client.host is Render's own proxy, not the visitor.
    # Two different real visitors behind that same proxy host must be
    # tracked independently via X-Forwarded-For, not collapsed into one
    # shared bucket keyed on the proxy's IP.
    for _ in range(5):
        rate_limit(make_request("10.0.0.1", forwarded_for="9.9.9.9"))
    with pytest.raises(HTTPException) as exc_info:
        rate_limit(make_request("10.0.0.1", forwarded_for="9.9.9.9"))
    assert exc_info.value.status_code == 429

    # A different visitor IP behind the same proxy host is not blocked by
    # the first visitor's hits.
    rate_limit(make_request("10.0.0.1", forwarded_for="8.8.8.8"))  # should not raise


def test_uses_the_leftmost_ip_when_x_forwarded_for_has_multiple_hops():
    # Render appends its own hop after the original client, so the visitor
    # is always the first (leftmost) entry in a comma-separated chain.
    for _ in range(5):
        rate_limit(make_request("10.0.0.1", forwarded_for="7.7.7.7, 10.0.0.1"))
    with pytest.raises(HTTPException) as exc_info:
        rate_limit(make_request("10.0.0.1", forwarded_for="7.7.7.7, 10.0.0.1"))
    assert exc_info.value.status_code == 429
