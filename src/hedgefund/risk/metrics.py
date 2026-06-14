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


def summarize(equity: pd.Series, periods_per_year: int = PERIODS_PER_YEAR) -> dict[str, float]:
    r = returns(equity)
    return {
        "total_return": total_return(equity),
        "cagr": cagr(equity, periods_per_year),
        "ann_vol": ann_vol(equity, periods_per_year),
        "sharpe": sharpe(equity, periods_per_year),
        "sortino": sortino(equity, periods_per_year),
        "max_drawdown": max_drawdown(equity),
        "var_95": value_at_risk(r, 0.95),
        "cvar_95": cvar(r, 0.95),
    }
