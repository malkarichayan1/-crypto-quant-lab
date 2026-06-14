from __future__ import annotations

import pandas as pd

from hedgefund.dsl.spec import (
    Indicator,
    MomentumIndicator,
    RsiIndicator,
    SmaIndicator,
    VolatilityIndicator,
    ZscoreIndicator,
)


def compute_indicator(
    indicator: Indicator,
    close: pd.DataFrame,
    computed: dict[str, pd.DataFrame] | None = None,
) -> pd.DataFrame:
    """Return a (dates x symbols) frame where row t uses only data with index <= t.

    `computed` holds previously-computed indicator frames, keyed by id, so that
    zscore can reference a source indicator.
    """
    if isinstance(indicator, MomentumIndicator):
        return close.pct_change(indicator.lookback)
    if isinstance(indicator, SmaIndicator):
        return close.rolling(indicator.period).mean()
    if isinstance(indicator, VolatilityIndicator):
        return close.pct_change().rolling(indicator.lookback).std()
    if isinstance(indicator, RsiIndicator):
        return _rsi(close, indicator.period)
    if isinstance(indicator, ZscoreIndicator):
        if computed is None or indicator.source_id not in computed:
            raise KeyError(f"zscore source '{indicator.source_id}' not computed yet")
        src = computed[indicator.source_id]
        mean = src.rolling(indicator.lookback).mean()
        std = src.rolling(indicator.lookback).std()
        return (src - mean) / std
    raise TypeError(f"unknown indicator type: {indicator!r}")


def _rsi(close: pd.DataFrame, period: int) -> pd.DataFrame:
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def compute_all(indicators: list[Indicator], close: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Compute every indicator, honoring zscore dependencies (source before dependent)."""
    out: dict[str, pd.DataFrame] = {}
    for ind in [i for i in indicators if not isinstance(i, ZscoreIndicator)]:
        out[ind.id] = compute_indicator(ind, close, out)
    for ind in [i for i in indicators if isinstance(i, ZscoreIndicator)]:
        out[ind.id] = compute_indicator(ind, close, out)
    return out
