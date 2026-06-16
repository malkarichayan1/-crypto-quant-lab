from __future__ import annotations

from fastapi.testclient import TestClient

from hedgefund.api.app import create_app


def test_cors_allows_vite_dev_origin():
    client = TestClient(create_app())
    resp = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"
