from hedgefund.data.fetch import fetch_ohlcv, fetch_ohlcv_paginated


class _FakeExchange:
    def __init__(self):
        self.calls = 0

    def fetch_ohlcv(self, symbol, timeframe, since, limit):
        self.calls += 1
        return [[1577836800000, 1, 2, 0.5, 1.5, 10]]


def test_fetch_ohlcv_calls_exchange_and_returns_rows():
    ex = _FakeExchange()
    rows = fetch_ohlcv(ex, "BTC/USDT", since_ms=None, limit=10)
    assert ex.calls == 1
    assert rows[0][4] == 1.5


class FakeExchange:
    """Records the timeframe/since of each call and returns scripted pages."""

    def __init__(self, pages):
        self._pages = list(pages)
        self.calls = []

    def fetch_ohlcv(self, symbol, timeframe, since, limit):
        self.calls.append({"symbol": symbol, "timeframe": timeframe, "since": since, "limit": limit})
        return self._pages.pop(0) if self._pages else []


def test_fetch_ohlcv_passes_timeframe_through():
    ex = FakeExchange([[[0, 1, 1, 1, 1, 1]]])
    fetch_ohlcv(ex, "BTC/USDT", since_ms=0, limit=10, timeframe="1h")
    assert ex.calls[0]["timeframe"] == "1h"


def test_paginated_steps_cursor_by_hour_for_1h():
    # One full page (len == limit) then a short page stops iteration.
    page1 = [[0, 1, 1, 1, 1, 1], [3_600_000, 1, 1, 1, 1, 1]]
    ex = FakeExchange([page1, []])
    fetch_ohlcv_paginated(ex, "BTC/USDT", since_ms=0, limit=2, timeframe="1h")
    # Second call's `since` advances past last_ts (3_600_000) by one hour.
    assert ex.calls[1]["since"] == 3_600_000 + 3_600_000


def test_paginated_steps_cursor_by_day_for_1d_default():
    page1 = [[0, 1, 1, 1, 1, 1], [86_400_000, 1, 1, 1, 1, 1]]
    ex = FakeExchange([page1, []])
    fetch_ohlcv_paginated(ex, "BTC/USDT", since_ms=0, limit=2)  # default 1d
    assert ex.calls[1]["since"] == 86_400_000 + 86_400_000
