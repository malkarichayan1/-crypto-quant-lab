import numpy as np
import pandas as pd
import pytest

from hedgefund.risk.metrics import (
    alpha,
    beta,
    information_ratio,
    summarize,
    tracking_error,
)


def _rets(values) -> pd.Series:
    idx = pd.date_range("2020-01-01", periods=len(values), freq="D")
    return pd.Series(values, index=idx, dtype=float)


def _equity(values) -> pd.Series:
    idx = pd.date_range("2020-01-01", periods=len(values), freq="D")
    return pd.Series(values, index=idx, dtype=float)


def test_beta_of_2x_benchmark_is_two():
    rb = _rets([0.01, -0.02, 0.03, 0.00, 0.015])
    rs = 2.0 * rb
    assert beta(rs, rb) == pytest.approx(2.0)


def test_identity_strategy_equals_benchmark():
    r = _rets([0.01, -0.02, 0.03, 0.005])
    assert beta(r, r) == pytest.approx(1.0)
    assert alpha(r, r) == pytest.approx(0.0)
    assert tracking_error(r, r) == pytest.approx(0.0)
    assert information_ratio(r, r) == 0.0


def test_beta_guards_zero_variance_benchmark():
    rb = _rets([0.01, 0.01, 0.01])  # constant -> zero variance
    rs = _rets([0.02, -0.01, 0.03])
    result = beta(rs, rb)
    assert result == 0.0
    assert np.isfinite(result)


def test_metrics_return_zero_when_too_few_overlapping_points():
    rs = _rets([0.01])
    rb = _rets([0.02])
    assert beta(rs, rb) == 0.0
    assert information_ratio(rs, rb) == 0.0


def test_alpha_is_annualized_arithmetically():
    # strategy = benchmark + constant 0.001 per period, beta == 1 -> alpha/period == 0.001
    rb = _rets([0.01, -0.02, 0.03, 0.00])
    rs = rb + 0.001
    # beta ~ 1, so per-period alpha ~ 0.001; annualized = 0.001 * 365
    assert alpha(rs, rb, periods_per_year=365) == pytest.approx(0.001 * 365, rel=1e-6)


def test_summarize_without_benchmark_is_unchanged():
    eq = _equity([100, 110, 121, 133.1])
    out = summarize(eq)
    assert set(out) == {
        "total_return",
        "cagr",
        "ann_vol",
        "sharpe",
        "sortino",
        "max_drawdown",
        "var_95",
        "cvar_95",
    }


def test_summarize_with_benchmark_adds_relative_keys():
    eq = _equity([100, 110, 121, 133.1])
    bm = _equity([100, 105, 110, 120])
    base = summarize(eq)
    out = summarize(eq, benchmark=bm)
    assert set(out) - set(base) == {
        "beta",
        "alpha",
        "tracking_error",
        "information_ratio",
    }
