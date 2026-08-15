from __future__ import annotations

import pytest


def test_get_portfolio_bootstraps_100k(client):
    res = client.get("/portfolio")
    assert res.status_code == 200
    body = res.json()
    assert body["starting_cash"] == 100_000.0
    assert body["cash"] == 100_000.0
    assert body["positions"] == []
    assert body["equity"] == 100_000.0
    assert body["total_return_pct"] == 0.0


def test_buy_creates_position_and_reduces_cash(client):
    res = client.post("/portfolio/orders",
                      json={"symbol": "BTC", "side": "buy", "usd_amount": 1000.0})
    assert res.status_code == 201
    order = res.json()
    assert order["units"] == pytest.approx(10.0)
    assert order["fill_price"] == 100.0

    body = client.get("/portfolio").json()
    assert body["cash"] == pytest.approx(99_000.0)
    pos = body["positions"][0]
    assert pos["symbol"] == "BTC"
    assert pos["units"] == pytest.approx(10.0)
    assert pos["market_value"] == pytest.approx(1_000.0)
    # today's P/L: 10 units * (100 - 95 sparkline[0]) = 50
    assert body["today_pl"] == pytest.approx(50.0)


def test_buy_over_cash_rejected_with_friendly_message(client):
    res = client.post("/portfolio/orders",
                      json={"symbol": "BTC", "side": "buy", "usd_amount": 200_000.0})
    assert res.status_code == 400
    assert "buying power" in res.json()["detail"]


def test_sell_more_than_held_rejected(client):
    client.post("/portfolio/orders",
                json={"symbol": "BTC", "side": "buy", "usd_amount": 1000.0})
    res = client.post("/portfolio/orders",
                      json={"symbol": "BTC", "side": "sell", "usd_amount": 2000.0})
    assert res.status_code == 400
    assert "only hold" in res.json()["detail"]


def test_order_unknown_symbol_404(client):
    res = client.post("/portfolio/orders",
                      json={"symbol": "ZZZ", "side": "buy", "usd_amount": 100.0})
    assert res.status_code == 404


def test_order_rejected_when_prices_unavailable(client, market_data):
    market_data.unavailable = True
    res = client.post("/portfolio/orders",
                      json={"symbol": "BTC", "side": "buy", "usd_amount": 100.0})
    assert res.status_code == 503


def test_orders_listed_newest_first(client):
    client.post("/portfolio/orders",
                json={"symbol": "BTC", "side": "buy", "usd_amount": 100.0})
    client.post("/portfolio/orders",
                json={"symbol": "ETH", "side": "buy", "usd_amount": 50.0})
    orders = client.get("/portfolio/orders").json()
    assert [o["symbol"] for o in orders] == ["ETH", "BTC"]


def test_equity_series_includes_live_point(client):
    res = client.get("/portfolio/equity?range=1M")
    assert res.status_code == 200
    body = res.json()
    assert body["range"] == "1M"
    assert len(body["points"]) == 1  # no snapshots yet → live point only
    assert body["points"][0]["equity"] == pytest.approx(100_000.0)


def test_equity_bad_range_422(client):
    assert client.get("/portfolio/equity?range=5Y").status_code == 422


def test_reset_starts_a_fresh_portfolio(client):
    client.post("/portfolio/orders",
                json={"symbol": "BTC", "side": "buy", "usd_amount": 1000.0})
    res = client.post("/portfolio/reset", json={"starting_cash": 100_000.0})
    assert res.status_code == 201

    body = client.get("/portfolio").json()
    assert body["cash"] == 100_000.0
    assert body["positions"] == []


def test_placing_an_order_clears_cached_advice(client, session):
    from datetime import datetime, timezone

    from hedgefund.api.db.manual_repository import ManualRepository

    repo = ManualRepository(session, "test-device")
    portfolio = repo.get_or_create_active_portfolio(100_000.0)
    repo.add_advice(portfolio.id, scope="portfolio", payload={"suggestions": []})
    session.commit()

    response = client.post(
        "/portfolio/orders", json={"symbol": "BTC", "side": "buy", "usd_amount": 100.0}
    )

    assert response.status_code == 201
    cutoff = datetime(2000, 1, 1, tzinfo=timezone.utc)
    assert repo.get_fresh_advice(portfolio.id, scope="portfolio", not_before=cutoff) is None


def test_portfolio_is_isolated_per_device(client):
    client.post("/portfolio/orders",
                json={"symbol": "AAA", "side": "buy", "usd_amount": 1000.0})
    other = client.get("/portfolio", headers={"X-Device-Id": "other-device"})
    # A different device bootstraps its own fresh $100k portfolio, unaffected
    # by "test-device"'s trade.
    assert other.json()["cash"] == 100_000.0
