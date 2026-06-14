import numpy as np
import pandas as pd
import pytest

from hedgefund.engine.indicators import compute_indicator
from hedgefund.dsl.spec import MomentumIndicator, SmaIndicator


def _closes() -> pd.DataFrame:
    idx = pd.date_range("2020-01-01", periods=5, freq="D")
    return pd.DataFrame({"AAA": [100.0, 110.0, 121.0, 133.1, 146.41]}, index=idx)


def test_momentum_is_trailing_return():
    close = _closes()
    out = compute_indicator(MomentumIndicator(type="momentum", id="m1", lookback=1), close)
    assert out["AAA"].iloc[1] == pytest.approx(0.10)
    assert np.isnan(out["AAA"].iloc[0])


def test_sma_uses_only_trailing_window():
    close = _closes()
    out = compute_indicator(SmaIndicator(type="sma", id="s2", period=2), close)
    assert out["AAA"].iloc[1] == pytest.approx(105.0)
    assert np.isnan(out["AAA"].iloc[0])


def test_no_lookahead_deleting_future_does_not_change_past():
    close = _closes()
    full = compute_indicator(SmaIndicator(type="sma", id="s2", period=2), close)
    truncated = compute_indicator(
        SmaIndicator(type="sma", id="s2", period=2), close.iloc[:3]
    )
    assert full["AAA"].iloc[1] == truncated["AAA"].iloc[1]
