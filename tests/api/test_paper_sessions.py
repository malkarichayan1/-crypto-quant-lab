import uuid


def _spec_json():
    return {
        "name": "x",
        "universe": ["BTC/USDT"],
        "indicators": [{"type": "sma", "id": "s", "period": 2}],
        "selection": {
            "mode": "time_series",
            "entry": {"indicator_id": "s", "op": ">", "value": 0},
            "exit": {"indicator_id": "s", "op": "<", "value": 0},
        },
        "start": "2026-06-17",
        "end": "2026-06-30",
    }


def test_post_creates_session_from_spec_json(client):
    r = client.post("/paper-sessions", json={"label": "t", "spec_json": _spec_json()})
    assert r.status_code == 201
    body = r.json()
    assert body["label"] == "t" and body["status"] == "active"
    assert body["universe"] == ["BTC/USDT"] and body["timeframe"] == "1h"


def test_post_rejects_both_sources(client):
    r = client.post("/paper-sessions", json={
        "label": "t", "spec_json": _spec_json(), "source_backtest_id": str(uuid.uuid4()),
    })
    assert r.status_code == 422


def test_post_rejects_neither_source(client):
    r = client.post("/paper-sessions", json={"label": "t"})
    assert r.status_code == 422


def test_post_rejects_invalid_spec(client):
    r = client.post("/paper-sessions", json={"label": "t", "spec_json": {"name": "broken"}})
    assert r.status_code == 422


def test_list_and_get_and_stop(client):
    created = client.post("/paper-sessions", json={"label": "t", "spec_json": _spec_json()}).json()
    sid = created["id"]
    assert any(s["id"] == sid for s in client.get("/paper-sessions").json())
    detail = client.get(f"/paper-sessions/{sid}").json()
    assert detail["spec_json"]["name"] == "x"
    assert detail["equity"] == [] and detail["trades"] == []
    stopped = client.post(f"/paper-sessions/{sid}/stop").json()
    assert stopped["status"] == "stopped"


def test_get_missing_returns_404(client):
    assert client.get(f"/paper-sessions/{uuid.uuid4()}").status_code == 404
