import pandas as pd
import pytest

from hedgefund.data.panel import PricePanel
from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.indicators import compute_all
from hedgefund.paper.engine import Fill, step
from hedgefund.paper.state import PaperState


def _panel(index, prices):
    """Single-symbol BTC/USDT panel; open==close==price for simple fills."""
    df = pd.DataFrame({"BTC/USDT": prices}, index=pd.DatetimeIndex(index))
    return PricePanel(open=df, high=df, low=df, close=df, volume=df * 0 + 1.0)


def _spec():
    return StrategySpec.model_validate({
        "name": "always-long",
        "universe": ["BTC/USDT"],
        "indicators": [{"type": "sma", "id": "s", "period": 1}],
        "selection": {"mode": "time_series",
                      "entry": {"indicator_id": "s", "op": ">", "value": 0},
                      "exit": {"indicator_id": "s", "op": "<", "value": 0}},
        "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
        "costs": {"fee_bps": 0.0, "slippage_bps": 0.0},
        "start": "2026-06-17", "end": "2026-06-18",
    })


def test_first_step_decides_target_but_does_not_fill():
    index = ["2026-06-17T00:00:00", "2026-06-17T01:00:00"]
    panel = _panel(index, [100.0, 110.0])
    spec = _spec()
    indicators = compute_all(spec.indicators, panel.close)
    state = PaperState.initial(starting_cash=10_000.0)
    ts0 = panel.close.index[0]

    new_state, fills, equity = step(spec, state, panel, indicators, ts0)

    assert fills == []                      # nothing pending to fill on bar 0
    assert equity == 10_000.0               # all cash, no positions
    assert new_state.pending_target == {"BTC/USDT": 1.0}  # decided, fills next bar
    assert new_state.prev_ts == ts0.isoformat()
    assert new_state.last_processed_ts == ts0.isoformat()


def test_second_step_fills_pending_target_at_open():
    index = ["2026-06-17T00:00:00", "2026-06-17T01:00:00"]
    panel = _panel(index, [100.0, 110.0])
    spec = _spec()
    indicators = compute_all(spec.indicators, panel.close)
    state = PaperState.initial(starting_cash=10_000.0)
    ts0, ts1 = panel.close.index[0], panel.close.index[1]

    state, _, _ = step(spec, state, panel, indicators, ts0)
    new_state, fills, equity = step(spec, state, panel, indicators, ts1)

    # Fill at bar 1 open (110.0): 10_000 / 110 units bought.
    assert len(fills) == 1
    assert fills[0].symbol == "BTC/USDT"
    assert fills[0].price == 110.0
    assert fills[0].units == pytest.approx(10_000.0 / 110.0, rel=1e-9)
    # Equity marked at bar 1 close (also 110.0) ~= 10_000 (zero costs).
    assert equity == pytest.approx(10_000.0, rel=1e-9)
    assert new_state.pending_target == {"BTC/USDT": 1.0}


def test_non_rebalance_bar_decides_no_target():
    # 2026-06-16 is a Tuesday; with weekly rebalance the gate only fires on
    # Mondays, so a Tuesday bar must NOT decide a new target.
    index = ["2026-06-16T00:00:00", "2026-06-16T01:00:00"]
    panel = _panel(index, [100.0, 110.0])
    spec = StrategySpec.model_validate({
        "name": "always-long", "universe": ["BTC/USDT"],
        "indicators": [{"type": "sma", "id": "s", "period": 1}],
        "selection": {"mode": "time_series",
                      "entry": {"indicator_id": "s", "op": ">", "value": 0},
                      "exit": {"indicator_id": "s", "op": "<", "value": 0}},
        "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
        "rebalance": "weekly",
        "costs": {"fee_bps": 0.0, "slippage_bps": 0.0},
        "start": "2026-06-16", "end": "2026-06-17",
    })
    indicators = compute_all(spec.indicators, panel.close)
    state = PaperState.initial(starting_cash=10_000.0)
    new_state, _, _ = step(spec, state, panel, indicators, panel.close.index[0])
    assert new_state.pending_target is None  # Tuesday is not a rebalance bar
