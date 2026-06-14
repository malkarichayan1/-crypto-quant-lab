import numpy as np
import pandas as pd

from hedgefund.risk.metrics import (
    max_drawdown,
    sharpe,
    total_return,
    value_at_risk,
    summarize,
)


def _equity(values) -> pd.Series:
    idx = pd.date_range("2020-01-01", periods=len(values), freq="D")
    return pd.Series(values, index=idx, dtype=float)


def test_total_return():
    eq = _equity([100, 110, 121])
    assert abs(total_return(eq) - 0.21) < 1e-9


def test_max_drawdown_known_value():
    eq = _equity([100, 120, 60, 90])
    assert abs(max_drawdown(eq) - (-0.5)) < 1e-9


def test_sharpe_of_constant_returns_is_finite():
    eq = _equity([100, 101, 102.01])
    assert np.isfinite(sharpe(eq))


def test_value_at_risk_95_historical_nonnegative():
    rets = pd.Series([-0.10, -0.05, 0.0, 0.02, 0.03])
    assert value_at_risk(rets, level=0.95) >= 0.0


def test_summarize_returns_expected_keys():
    eq = _equity([100, 110, 121, 133.1])
    out = summarize(eq, periods_per_year=365)
    for key in ("total_return", "cagr", "ann_vol", "sharpe", "sortino", "max_drawdown", "var_95"):
        assert key in out
