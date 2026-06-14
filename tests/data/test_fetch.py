from hedgefund.data.fetch import fetch_ohlcv


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
