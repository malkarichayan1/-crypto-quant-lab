from __future__ import annotations

import uuid


def _spec_body():
    return {
        "spec": {
            "name": "route_test",
            "universe": ["AAA"],
            "indicators": [{"type": "momentum", "id": "m1", "lookback": 1}],
            "selection": {
                "mode": "cross_sectional",
                "rank_by": "m1",
                "long_top": 1,
                "short_bottom": 0,
            },
            "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
            "rebalance": "daily",
            "costs": {"fee_bps": 10, "slippage_bps": 5},
            "start": "2020-01-01",
            "end": "2020-01-06",
            "benchmark": "AAA",
        },
        "starting_cash": 10000.0,
    }


def test_post_creates_and_returns_full_result(client):
    resp = client.post("/backtests", json=_spec_body())
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "route_test"
    assert "sharpe" in body["metrics"]
    assert len(body["equity_curve"]) > 0
    assert "id" in body


def test_post_then_get_by_id(client):
    created = client.post("/backtests", json=_spec_body()).json()
    resp = client.get(f"/backtests/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_list_returns_summary_without_curves(client):
    client.post("/backtests", json=_spec_body())
    resp = client.get("/backtests")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) >= 1
    assert "equity_curve" not in rows[0]
    assert "metrics" in rows[0]


def test_get_missing_returns_404(client):
    resp = client.get(f"/backtests/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_delete_removes_backtest(client):
    created = client.post("/backtests", json=_spec_body()).json()
    assert client.delete(f"/backtests/{created['id']}").status_code == 204
    assert client.get(f"/backtests/{created['id']}").status_code == 404


def test_invalid_spec_returns_422(client):
    body = _spec_body()
    # rank_by references an undefined indicator -> SpecValidationError -> 422
    body["spec"]["selection"]["rank_by"] = "does_not_exist"
    resp = client.post("/backtests", json=body)
    assert resp.status_code == 422
