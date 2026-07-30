from __future__ import annotations


def test_list_assets(client):
    res = client.get("/market/assets")
    assert res.status_code == 200
    body = res.json()
    assert body["stale"] is False
    symbols = [a["symbol"] for a in body["assets"]]
    assert symbols == ["BTC", "ETH"]
    btc = body["assets"][0]
    assert btc["name"] == "Bitcoin"
    assert btc["price"] == 100.0
    assert len(btc["sparkline"]) == 24


def test_list_assets_stale_flag(client, market_data):
    market_data.stale = True
    res = client.get("/market/assets")
    assert res.status_code == 200
    assert res.json()["stale"] is True


def test_list_assets_unavailable(client, market_data):
    market_data.unavailable = True
    res = client.get("/market/assets")
    assert res.status_code == 503


def test_get_candles(client):
    res = client.get("/market/assets/BTC/candles?range=1D")
    assert res.status_code == 200
    body = res.json()
    assert body["symbol"] == "BTC"
    assert body["range"] == "1D"
    assert len(body["candles"]) == 30
    first = body["candles"][0]
    assert set(first) == {"ts", "open", "high", "low", "close", "volume"}


def test_get_candles_unknown_symbol(client):
    res = client.get("/market/assets/ZZZ/candles?range=1D")
    assert res.status_code == 404


def test_get_candles_bad_range(client):
    res = client.get("/market/assets/BTC/candles?range=5Y")
    assert res.status_code == 422
