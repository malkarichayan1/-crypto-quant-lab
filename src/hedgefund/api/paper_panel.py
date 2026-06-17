from __future__ import annotations

import time
from collections.abc import Callable

import pandas as pd

from hedgefund.data.fetch import fetch_ohlcv_paginated, ohlcv_to_frame
from hedgefund.data.panel import FIELDS, PricePanel

# Loader signature: (symbols, timeframe, lookback_bars) -> PricePanel
PaperPanelLoader = Callable[[list[str], str, int], PricePanel]

_MS_PER_BAR = {"1m": 60_000, "15m": 900_000, "1h": 3_600_000, "1d": 86_400_000}


def build_panel_from_rows(rows_by_symbol: dict[str, list[list[float]]]) -> PricePanel:
    """Assemble ccxt OHLCV rows per symbol into one aligned PricePanel.

    The union of all symbols' timestamps forms the index; a symbol missing a bar
    stays NaN and is therefore not tradable on that bar (same convention as
    `data.panel.load_panel`)."""
    frames = {sym: ohlcv_to_frame(rows) for sym, rows in rows_by_symbol.items()}
    symbols = list(rows_by_symbol.keys())
    field_frames: dict[str, pd.DataFrame] = {}
    for fld in FIELDS:
        wide = pd.DataFrame({sym: frames[sym][fld] for sym in symbols}).sort_index()
        field_frames[fld] = wide
    return PricePanel.from_field_frames(field_frames)


def load_live_panel(
    exchange, symbols: list[str], timeframe: str, lookback_bars: int
) -> PricePanel:
    """Fetch the last `lookback_bars` of `timeframe` candles up to now for each
    symbol and assemble a PricePanel. `exchange` is a ccxt instance (injected)."""
    step = _MS_PER_BAR[timeframe]
    now_ms = int(time.time() * 1000)
    since_ms = now_ms - lookback_bars * step
    rows_by_symbol = {
        sym: fetch_ohlcv_paginated(exchange, sym, since_ms, timeframe=timeframe)
        for sym in symbols
    }
    return build_panel_from_rows(rows_by_symbol)


def get_paper_panel_loader() -> PaperPanelLoader:
    """Default loader using a ccxt binance instance. Overridden in tests by
    passing a fake loader to the ticker."""

    def _load(symbols: list[str], timeframe: str, lookback_bars: int) -> PricePanel:
        import ccxt  # local import: only needed when actually trading live

        exchange = ccxt.binance()
        return load_live_panel(exchange, symbols, timeframe, lookback_bars)

    return _load
