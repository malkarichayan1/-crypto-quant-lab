from __future__ import annotations


def test_watchlist_flow(client):
    assert client.get("/watchlist").json() == {"symbols": []}

    res = client.put("/watchlist/BTC")
    assert res.status_code == 200
    assert res.json() == {"symbols": ["BTC"]}

    client.put("/watchlist/ETH")
    assert client.get("/watchlist").json() == {"symbols": ["BTC", "ETH"]}

    res = client.delete("/watchlist/BTC")
    assert res.json() == {"symbols": ["ETH"]}


def test_star_lowercase_symbol_is_normalized(client):
    res = client.put("/watchlist/btc")
    assert res.json() == {"symbols": ["BTC"]}


def test_star_unknown_symbol_rejected(client):
    res = client.put("/watchlist/ZZZ")
    assert res.status_code == 422
