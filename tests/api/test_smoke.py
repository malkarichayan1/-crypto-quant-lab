from __future__ import annotations


def test_smoke_post_minimal_spec_persists_and_returns_metrics(client):
    body = {
        "spec": {
            "name": "smoke",
            "universe": ["AAA"],
            "indicators": [{"type": "momentum", "id": "m1", "lookback": 1}],
            "selection": {
                "mode": "cross_sectional",
                "rank_by": "m1",
                "long_top": 1,
                "short_bottom": 0,
            },
            "start": "2020-01-01",
            "end": "2020-01-06",
            "benchmark": "AAA",
        }
    }
    resp = client.post("/backtests", json=body)
    assert resp.status_code == 201
    result = resp.json()
    assert "sharpe" in result["metrics"]
    assert "total_return" in result["metrics"]
    # benchmark == universe symbol, so relative metrics are present
    assert "information_ratio" in result["metrics"]
    # persisted and retrievable
    assert client.get(f"/backtests/{result['id']}").status_code == 200
