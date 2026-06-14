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
    if sizing.scheme != "equal_weight":
        raise NotImplementedError(
            f"sizing scheme '{sizing.scheme}' is not supported yet; only 'equal_weight' is available in Slice 1"
        )
    if isinstance(selection, CrossSectionalSelection):
        return _cross_sectional(selection, sizing, indicator_rows, tradable)
    if isinstance(selection, TimeSeriesSelection):
        return _time_series(selection, sizing, indicator_rows, tradable, prev_state)
    raise TypeError(f"unknown selection: {selection!r}")


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
    n = len(longs) + len(shorts)
    if n == 0:
        return {}
    per = sizing.gross_leverage / n
    weights = {s: per for s in longs}
    weights.update({s: -per for s in shorts})
    return weights


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
    if not active:
        return {}
    per = sizing.gross_leverage / len(active)
    return {s: per for s in active}
