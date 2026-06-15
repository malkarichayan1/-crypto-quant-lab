from __future__ import annotations

import math

import pandas as pd

from hedgefund.dsl.spec import (
    CrossSectionalSelection,
    Selection,
    Sizing,
    TimeSeriesSelection,
)


def _eval_condition(value: float, op: str, threshold: float) -> bool:
    if value is None or math.isnan(value):
        return False
    return {
        "<": value < threshold,
        ">": value > threshold,
        "<=": value <= threshold,
        ">=": value >= threshold,
    }[op]


def target_weights(
    selection: Selection,
    sizing: Sizing,
    indicator_rows: dict[str, pd.Series],
    tradable: list[str],
    prev_state: dict[str, bool],
) -> dict[str, float]:
    """Return target weights {symbol: weight}. `prev_state` carries time-series
    position memory ({symbol: is_long}) and is mutated in place for that mode."""
    if isinstance(selection, CrossSectionalSelection):
        return _cross_sectional(selection, sizing, indicator_rows, tradable)
    if isinstance(selection, TimeSeriesSelection):
        return _time_series(selection, sizing, indicator_rows, tradable, prev_state)
    raise TypeError(f"unknown selection: {selection!r}")


def _apply_sizing(
    signed: list[tuple[str, float]],
    sizing: Sizing,
    indicator_rows: dict[str, pd.Series],
) -> dict[str, float]:
    """Turn selected (symbol, sign) pairs into weights per the sizing scheme.

    - equal_weight:   each |weight| = gross_leverage / n
    - fixed_fraction: each |weight| = fraction (independent of n)
    - inverse_vol:    |weight| proportional to 1/vol, normalized to gross_leverage;
                      symbols with missing or non-positive vol are dropped.
    """
    if not signed:
        return {}
    if sizing.scheme == "equal_weight":
        per = sizing.gross_leverage / len(signed)
        return {s: sign * per for s, sign in signed}
    if sizing.scheme == "fixed_fraction":
        return {s: sign * sizing.fraction for s, sign in signed}
    if sizing.scheme == "inverse_vol":
        vol_row = indicator_rows[sizing.vol_indicator_id]
        inv: dict[str, tuple[float, float]] = {}
        for s, sign in signed:
            v = vol_row.get(s, float("nan"))
            if v is None or math.isnan(v) or v <= 0:
                continue
            inv[s] = (sign, 1.0 / v)
        total = sum(mag for _, mag in inv.values())
        if total == 0:
            return {}
        return {
            s: sign * sizing.gross_leverage * (mag / total)
            for s, (sign, mag) in inv.items()
        }
    raise NotImplementedError(f"unknown sizing scheme: {sizing.scheme!r}")


def _cross_sectional(
    sel: CrossSectionalSelection,
    sizing: Sizing,
    indicator_rows: dict[str, pd.Series],
    tradable: list[str],
) -> dict[str, float]:
    row = indicator_rows[sel.rank_by].reindex(tradable).dropna()
    ranked = list(row.sort_values(ascending=False).index)
    long_n = min(sel.long_top, len(ranked))
    longs = ranked[:long_n]
    remaining = ranked[long_n:]
    short_n = min(sel.short_bottom, len(remaining))
    shorts = remaining[len(remaining) - short_n:] if short_n else []
    signed = [(s, 1.0) for s in longs] + [(s, -1.0) for s in shorts]
    return _apply_sizing(signed, sizing, indicator_rows)


def _time_series(
    sel: TimeSeriesSelection,
    sizing: Sizing,
    indicator_rows: dict[str, pd.Series],
    tradable: list[str],
    prev_state: dict[str, bool],
) -> dict[str, float]:
    entry_row = indicator_rows[sel.entry.indicator_id]
    exit_row = indicator_rows[sel.exit.indicator_id]
    active: list[str] = []
    for sym in tradable:
        is_long = prev_state.get(sym, False)
        entry_val = entry_row.get(sym, float("nan"))
        exit_val = exit_row.get(sym, float("nan"))
        if not is_long and _eval_condition(entry_val, sel.entry.op, sel.entry.value):
            is_long = True
        elif is_long and _eval_condition(exit_val, sel.exit.op, sel.exit.value):
            is_long = False
        prev_state[sym] = is_long
        if is_long:
            active.append(sym)
    return _apply_sizing([(s, 1.0) for s in active], sizing, indicator_rows)
