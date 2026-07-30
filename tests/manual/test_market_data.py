from __future__ import annotations

import pytest

from hedgefund.manual.market_data import (
    MarketDataCache,
    PricesUnavailableError,
    UnknownSymbolError,
    quote_from_rows,
)


def make_rows(n: int, start_close: float = 100.0) -> list[list[float]]:
    """n hourly OHLCV rows with close increasing by 1 per bar."""
    rows = []
    for i in range(n):
        close = start_close + i
        rows.append([i * 3_600_000, close - 0.5, close + 1.0, close - 1.0, close, 10.0])
    return rows


class FakeExchange:
    def __init__(self) -> None:
        self.fail = False
        self.calls = 0

    def fetch_ohlcv(self, symbol, timeframe="1h", since=None, limit=1000):
        self.calls += 1
        if self.fail:
            raise RuntimeError("network down")
        return make_rows(min(limit, 400))


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def cache():
    exchange = FakeExchange()
    clock = FakeClock()
    c = MarketDataCache(
        exchange=exchange, universe=["BTC/USDT", "ETH/USDT"], clock=clock
    )
    return c, exchange, clock


def test_quote_from_rows_math():
    q = quote_from_rows("BTC", "Bitcoin", make_rows(26))
    assert q.price == 125.0                      # last close
    # 24h reference = close 24 bars before the last (index -25 → close 101)
    assert q.change_24h_pct == pytest.approx((125.0 - 101.0) / 101.0)
    assert q.high_24h == 126.0                   # max high of last 24 bars
    assert q.low_24h == 101.0                    # min low of last 24 bars
    assert q.volume_24h == pytest.approx(240.0)  # 24 bars * 10
    assert len(q.sparkline) == 24
    assert q.sparkline[-1] == 125.0


def test_get_assets_caches_within_ttl(cache):
    c, exchange, clock = cache
    snap1 = c.get_assets()
    assert {a.symbol for a in snap1.assets} == {"BTC", "ETH"}
    assert snap1.stale is False
    calls = exchange.calls
    clock.now += 30  # inside 60s TTL
    c.get_assets()
    assert exchange.calls == calls  # served from cache


def test_get_assets_refreshes_after_ttl(cache):
    c, exchange, clock = cache
    c.get_assets()
    calls = exchange.calls
    clock.now += 61
    c.get_assets()
    assert exchange.calls > calls


def test_get_assets_stale_fallback_on_failure(cache):
    c, exchange, clock = cache
    c.get_assets()
    clock.now += 61
    exchange.fail = True
    snap = c.get_assets()
    assert snap.stale is True
    assert {a.symbol for a in snap.assets} == {"BTC", "ETH"}


def test_get_assets_unavailable_with_cold_cache(cache):
    c, exchange, _ = cache
    exchange.fail = True
    with pytest.raises(PricesUnavailableError):
        c.get_assets()


def test_get_candles_returns_series_and_caches(cache):
    c, exchange, clock = cache
    series = c.get_candles("BTC", "1D")
    assert series.symbol == "BTC"
    assert series.range_key == "1D"
    assert len(series.candles) > 0
    assert series.candles[0].close < series.candles[-1].close
    calls = exchange.calls
    c.get_candles("BTC", "1D")
    assert exchange.calls == calls  # cached


def test_get_candles_unknown_symbol(cache):
    c, _, _ = cache
    with pytest.raises(UnknownSymbolError):
        c.get_candles("ZZZ", "1D")


def test_get_candles_stale_fallback(cache):
    c, exchange, clock = cache
    c.get_candles("BTC", "1W")
    clock.now += 61
    exchange.fail = True
    series = c.get_candles("BTC", "1W")
    assert series.stale is True
