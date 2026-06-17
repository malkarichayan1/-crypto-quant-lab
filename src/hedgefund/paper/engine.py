from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.backtest import is_rebalance_day
from hedgefund.engine.orders import rebalance_to_weights
from hedgefund.engine.portfolio import Portfolio
from hedgefund.engine.weights import target_weights
from hedgefund.paper.state import PaperState


@dataclass(frozen=True)
class Fill:
    symbol: str
    units: float   # signed: +buy / -sell
    price: float


def step(
    spec: StrategySpec,
    state: PaperState,
    panel,                                  # PricePanel covering data up to >= ts
    indicators: dict[str, pd.DataFrame],    # precomputed over panel.close
    ts: pd.Timestamp,
) -> tuple[PaperState, list[Fill], float]:
    """Advance one session by one candle. Pure: no DB, no network.

    Reproduces one iteration of run_backtest's loop for bar `ts`:
      1) fill the target decided last bar at THIS bar's open,
      2) mark to market at THIS bar's close -> equity,
      3) decide a new target from indicator rows at `ts`, to fill next bar.
    Returns (new_state, fills_this_bar, equity_at_ts).
    """
    pf = Portfolio(cash=state.cash, positions=dict(state.positions))
    ts_state = dict(state.ts_state)
    prev_ts = pd.Timestamp(state.prev_ts) if state.prev_ts else None
    close = panel.close

    fills: list[Fill] = []

    # 1) Execute the target decided on the previous bar, at THIS bar's open.
    if state.pending_target is not None:
        tradable_now = [s for s in close.columns if panel.is_tradable(s, ts)]
        fill_prices = {s: panel.open_at(s, ts) for s in tradable_now}
        if pf.positions and prev_ts is not None:
            mark = {s: float(close.loc[prev_ts, s]) for s in pf.positions}
            pv = pf.value(mark)
        else:
            pv = pf.cash
        deltas = rebalance_to_weights(
            pf,
            target_weights={s: w for s, w in state.pending_target.items() if s in fill_prices},
            fill_prices=fill_prices,
            portfolio_value=pv,
            fee_bps=spec.costs.fee_bps,
            slippage_bps=spec.costs.slippage_bps,
        )
        fills = [Fill(symbol=s, units=d, price=fill_prices[s]) for s, d in deltas.items()]

    # 2) Mark to market at THIS bar's close.
    mark_prices = {s: panel.close_at(s, ts) for s in pf.positions if panel.is_tradable(s, ts)}
    equity = pf.value(mark_prices)

    # 3) On a rebalance bar only, decide a new target from data <= ts (filled
    #    next bar). On non-rebalance bars carry nothing forward -- exactly
    #    mirroring run_backtest, which leaves pending_target = None between
    #    rebalance bars, so the next bar fills nothing.
    if is_rebalance_day(spec.rebalance, ts):
        tradable = [s for s in close.columns if panel.is_tradable(s, ts)]
        rows = {iid: frame.loc[ts] for iid, frame in indicators.items()}
        new_pending = target_weights(spec.selection, spec.sizing, rows, tradable, ts_state)
    else:
        new_pending = None

    new_state = PaperState(
        cash=pf.cash,
        positions=dict(pf.positions),
        pending_target=new_pending,
        ts_state=ts_state,
        prev_ts=ts.isoformat(),
        last_processed_ts=ts.isoformat(),
    )
    return new_state, fills, equity
