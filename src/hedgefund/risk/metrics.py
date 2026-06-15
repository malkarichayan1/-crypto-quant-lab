from __future__ import annotations

import numpy as np
import pandas as pd

PERIODS_PER_YEAR = 365


def returns(equity: pd.Series) -> pd.Series:
    return equity.pct_change().dropna()


def total_return(equity: pd.Series) -> float:
    return float(equity.iloc[-1] / equity.iloc[0] - 1.0)


def cagr(equity: pd.Series, periods_per_year: int = PERIODS_PER_YEAR) -> float:
    n = len(equity) - 1
    if n <= 0:
        return 0.0
    growth = equity.iloc[-1] / equity.iloc[0]
    return float(growth ** (periods_per_year / n) - 1.0)


def ann_vol(equity: pd.Series, periods_per_year: int = PERIODS_PER_YEAR) -> float:
    r = returns(equity)
    if r.empty:
        return 0.0
    return float(r.std(ddof=0) * np.sqrt(periods_per_year))


def sharpe(equity: pd.Series, periods_per_year: int = PERIODS_PER_YEAR) -> float:
    r = returns(equity)
    sd = r.std(ddof=0)
    if r.empty or sd == 0:
        return 0.0
    return float((r.mean() / sd) * np.sqrt(periods_per_year))


def sortino(equity: pd.Series, periods_per_year: int = PERIODS_PER_YEAR) -> float:
    r = returns(equity)
    downside = r[r < 0]
    dd = downside.std(ddof=0)
    if r.empty or dd == 0:
        return 0.0
    return float((r.mean() / dd) * np.sqrt(periods_per_year))


def max_drawdown(equity: pd.Series) -> float:
    running_max = equity.cummax()
    drawdown = equity / running_max - 1.0
    return float(drawdown.min())


def value_at_risk(rets: pd.Series, level: float = 0.95) -> float:
    if rets.empty:
        return 0.0
    q = np.quantile(rets, 1.0 - level)
    return float(-min(q, 0.0))


def cvar(rets: pd.Series, level: float = 0.95) -> float:
    if rets.empty:
        return 0.0
    threshold = np.quantile(rets, 1.0 - level)
    tail = rets[rets <= threshold]
    if tail.empty:
        return 0.0
    return float(-tail.mean())


def _align(rs: pd.Series, rb: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Inner-join two return series on their index and drop any NaN rows."""
    joined = pd.concat([rs, rb], axis=1, join="inner").dropna()
    return joined.iloc[:, 0], joined.iloc[:, 1]


def beta(strategy_rets: pd.Series, benchmark_rets: pd.Series) -> float:
    rs, rb = _align(strategy_rets, benchmark_rets)
    if len(rs) < 2:
        return 0.0
    var_b = rb.var(ddof=0)
    if var_b == 0:
        return 0.0
    cov = ((rs - rs.mean()) * (rb - rb.mean())).mean()
    return float(cov / var_b)


def alpha(
    strategy_rets: pd.Series,
    benchmark_rets: pd.Series,
    periods_per_year: int = PERIODS_PER_YEAR,
) -> float:
    """Jensen's alpha (risk-free = 0), annualized arithmetically."""
    rs, rb = _align(strategy_rets, benchmark_rets)
    if len(rs) < 2:
        return 0.0
    per_period = rs.mean() - beta(rs, rb) * rb.mean()
    return float(per_period * periods_per_year)


def tracking_error(
    strategy_rets: pd.Series,
    benchmark_rets: pd.Series,
    periods_per_year: int = PERIODS_PER_YEAR,
) -> float:
    rs, rb = _align(strategy_rets, benchmark_rets)
    if len(rs) < 2:
        return 0.0
    active = rs - rb
    return float(active.std(ddof=0) * np.sqrt(periods_per_year))


def information_ratio(
    strategy_rets: pd.Series,
    benchmark_rets: pd.Series,
    periods_per_year: int = PERIODS_PER_YEAR,
) -> float:
    rs, rb = _align(strategy_rets, benchmark_rets)
    if len(rs) < 2:
        return 0.0
    active = rs - rb
    sd = active.std(ddof=0)
    if sd == 0:
        return 0.0
    return float((active.mean() / sd) * np.sqrt(periods_per_year))


def summarize(
    equity: pd.Series,
    periods_per_year: int = PERIODS_PER_YEAR,
    benchmark: pd.Series | None = None,
) -> dict[str, float]:
    r = returns(equity)
    out = {
        "total_return": total_return(equity),
        "cagr": cagr(equity, periods_per_year),
        "ann_vol": ann_vol(equity, periods_per_year),
        "sharpe": sharpe(equity, periods_per_year),
        "sortino": sortino(equity, periods_per_year),
        "max_drawdown": max_drawdown(equity),
        "var_95": value_at_risk(r, 0.95),
        "cvar_95": cvar(r, 0.95),
    }
    if benchmark is not None:
        rb = returns(benchmark)
        out["beta"] = beta(r, rb)
        out["alpha"] = alpha(r, rb, periods_per_year)
        out["tracking_error"] = tracking_error(r, rb, periods_per_year)
        out["information_ratio"] = information_ratio(r, rb, periods_per_year)
    return out
