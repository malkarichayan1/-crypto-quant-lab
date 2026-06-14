from __future__ import annotations

import time

import pandas as pd

_COLUMNS = ["open", "high", "low", "close", "volume"]


def ohlcv_to_frame(rows: list[list[float]]) -> pd.DataFrame:
    """Convert ccxt OHLCV rows [ts_ms, o, h, l, c, v] to an indexed DataFrame."""
    if not rows:
        return pd.DataFrame(columns=_COLUMNS)
    df = pd.DataFrame(rows, columns=["ts", *_COLUMNS])
    df.index = pd.to_datetime(df["ts"], unit="ms")
    df.index.name = "date"
    return df[_COLUMNS]


def fetch_ohlcv(exchange, symbol: str, since_ms: int | None, limit: int = 1000) -> list[list[float]]:
    """Thin wrapper around ccxt fetch_ohlcv with retry/backoff. `exchange` is a
    ccxt exchange instance (injected so tests can pass a fake)."""
    for attempt in range(5):
        try:
            return exchange.fetch_ohlcv(symbol, timeframe="1d", since=since_ms, limit=limit)
        except Exception:  # noqa: BLE001 - ccxt raises many network error types
            if attempt == 4:
                raise
            time.sleep(2**attempt)
    return []
