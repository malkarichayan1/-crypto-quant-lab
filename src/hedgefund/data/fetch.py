from __future__ import annotations

import time

import pandas as pd

_COLUMNS = ["open", "high", "low", "close", "volume"]
_MS_PER_BAR = {"1m": 60_000, "15m": 900_000, "1h": 3_600_000, "1d": 86_400_000}


def ohlcv_to_frame(rows: list[list[float]]) -> pd.DataFrame:
    """Convert ccxt OHLCV rows [ts_ms, o, h, l, c, v] to an indexed DataFrame."""
    if not rows:
        return pd.DataFrame(columns=_COLUMNS)
    df = pd.DataFrame(rows, columns=["ts", *_COLUMNS])
    df.index = pd.to_datetime(df["ts"], unit="ms")
    df.index.name = "date"
    return df[_COLUMNS]


def fetch_ohlcv(
    exchange, symbol: str, since_ms: int | None, limit: int = 1000, timeframe: str = "1d"
) -> list[list[float]]:
    """Thin wrapper around ccxt fetch_ohlcv with retry/backoff. `exchange` is a
    ccxt exchange instance (injected so tests can pass a fake)."""
    for attempt in range(5):
        try:
            return exchange.fetch_ohlcv(symbol, timeframe=timeframe, since=since_ms, limit=limit)
        except Exception:  # noqa: BLE001 - ccxt raises many network error types
            if attempt == 4:
                raise
            time.sleep(2**attempt)
    return []


def fetch_ohlcv_paginated(
    exchange, symbol: str, since_ms: int | None, limit: int = 1000, timeframe: str = "1d"
) -> list[list[float]]:
    """Page through ccxt fetch_ohlcv from `since_ms` to the present for `timeframe`.

    ccxt returns at most `limit` bars per call, so this advances `since` past the
    last received bar (by one bar of `timeframe`) each page and concatenates
    results. The boundary bar is deduplicated; iteration stops on an empty page
    or a short (final) page. Returns time-sorted rows [ts_ms, o, h, l, c, v]."""
    step = _MS_PER_BAR[timeframe]
    all_rows: list[list[float]] = []
    cursor = since_ms
    last_ts: int | None = None
    while True:
        page = fetch_ohlcv(exchange, symbol, cursor, limit=limit, timeframe=timeframe)
        if not page:
            break
        raw_len = len(page)
        if last_ts is not None:
            page = [row for row in page if row[0] > last_ts]
        if not page:
            break
        all_rows.extend(page)
        last_ts = page[-1][0]
        cursor = last_ts + step
        if raw_len < limit:
            break
    return all_rows
