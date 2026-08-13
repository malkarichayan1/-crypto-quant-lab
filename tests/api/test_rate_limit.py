# tests/api/test_rate_limit.py
from __future__ import annotations

import pytest
from fastapi import HTTPException, Request

from hedgefund.api.rate_limit import _hits, rate_limit


def make_request(ip: str) -> Request:
    return Request({"type": "http", "client": (ip, 1234)})


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
