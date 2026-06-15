from __future__ import annotations

import pandas as pd


def curve_to_json(series: pd.Series | None) -> list[list] | None:
    """Convert an equity/benchmark curve to [[iso_date, float_value], ...]."""
    if series is None:
        return None
    return [[ts.strftime("%Y-%m-%d"), float(val)] for ts, val in series.items()]


def trades_to_json(trade_log: pd.DataFrame) -> list[dict]:
    """Convert the trade-log DataFrame to a list of JSON-safe dicts."""
    if trade_log is None or trade_log.empty:
        return []
    df = trade_log.copy()
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    return df.to_dict(orient="records")
