from hedgefund.data.fetch import fetch_ohlcv_paginated

_BASE_MS = 1577836800000  # 2020-01-01 UTC
_DAY_MS = 86_400_000


class _PagingExchange:
    """Fake ccxt exchange holding `total_bars` daily bars, returning at most
    `page_limit` bars at or after `since` (inclusive)."""

    def __init__(self, total_bars: int, page_limit: int = 1000):
        self.bars = [
            [_BASE_MS + i * _DAY_MS, 1.0 + i, 2.0 + i, 0.5 + i, 1.5 + i, 10.0]
            for i in range(total_bars)
        ]
        self.page_limit = page_limit
        self.calls = 0

    def fetch_ohlcv(self, symbol, timeframe, since, limit):
        self.calls += 1
        start = 0 if since is None else next(
            (i for i, r in enumerate(self.bars) if r[0] >= since), len(self.bars)
        )
        return self.bars[start : start + min(limit, self.page_limit)]


def test_paginates_until_history_exhausted():
    ex = _PagingExchange(total_bars=2500, page_limit=1000)
    rows = fetch_ohlcv_paginated(ex, "BTC/USDT", since_ms=_BASE_MS, limit=1000)
    assert len(rows) == 2500
    ts = [r[0] for r in rows]
    assert ts == sorted(ts)
    assert len(ts) == len(set(ts))  # no duplicate bars across pages
    assert ex.calls >= 3  # needed multiple pages


def test_single_short_page_stops_immediately():
    ex = _PagingExchange(total_bars=10, page_limit=1000)
    rows = fetch_ohlcv_paginated(ex, "BTC/USDT", since_ms=_BASE_MS, limit=1000)
    assert len(rows) == 10
    assert ex.calls == 1


def test_empty_history_returns_no_rows():
    ex = _PagingExchange(total_bars=0, page_limit=1000)
    rows = fetch_ohlcv_paginated(ex, "BTC/USDT", since_ms=_BASE_MS, limit=1000)
    assert rows == []
