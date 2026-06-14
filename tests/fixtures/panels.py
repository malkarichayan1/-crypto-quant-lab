from __future__ import annotations

import numpy as np
import pandas as pd

from hedgefund.data.panel import FIELDS, PricePanel


def _frame(values: dict[str, list[float]], index: pd.DatetimeIndex) -> pd.DataFrame:
    return pd.DataFrame(values, index=index)


def two_asset_panel() -> PricePanel:
    """3 bars, 2 assets. AAA is not listed on bar 0 (NaN)."""
    idx = pd.to_datetime(["2020-01-01", "2020-01-02", "2020-01-03"])
    close = _frame({"AAA": [np.nan, 100.0, 110.0], "BBB": [100.0, 100.0, 100.0]}, idx)
    open_ = _frame({"AAA": [np.nan, 100.0, 100.0], "BBB": [100.0, 100.0, 100.0]}, idx)
    frames = {
        "open": open_,
        "high": close,
        "low": open_,
        "close": close,
        "volume": _frame({"AAA": [0.0, 1.0, 1.0], "BBB": [1.0, 1.0, 1.0]}, idx),
    }
    return PricePanel.from_field_frames({f: frames[f] for f in FIELDS})


def single_asset_panel(closes: list[float]) -> PricePanel:
    """One asset 'AAA'; open[t] == close[t-1] (fills at next open use this)."""
    idx = pd.date_range("2020-01-01", periods=len(closes), freq="D")
    close = _frame({"AAA": closes}, idx)
    opens = [closes[0]] + closes[:-1]
    open_ = _frame({"AAA": opens}, idx)
    frames = {
        "open": open_,
        "high": close,
        "low": close,
        "close": close,
        "volume": _frame({"AAA": [1.0] * len(closes)}, idx),
    }
    return PricePanel.from_field_frames({f: frames[f] for f in FIELDS})
