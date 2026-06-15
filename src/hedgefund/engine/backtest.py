from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.indicators import compute_all
from hedgefund.engine.orders import rebalance_to_weights
from hedgefund.engine.portfolio import Portfolio
from hedgefund.engine.weights import target_weights


@dataclass
class BacktestResult:
    equity_curve: pd.Series
    trade_log: pd.DataFrame
    spec: StrategySpec
    benchmark_curve: pd.Series | None = None


def _is_rebalance_day(rebalance: str, ts: pd.Timestamp) -> bool:
    if rebalance == "daily":
        return True
    return ts.weekday() == 0  # weekly = Mondays


def build_benchmark_curve(panel, symbol: str, dates, starting_cash: float) -> pd.Series:
    """Cost-free buy-and-hold equity curve for `symbol`, aligned to `dates`.

    Flat at `starting_cash` until the symbol is first tradable, then `units * close`
    where `units = starting_cash / first_tradable_close`. Interior NaN gaps after
    listing are forward-filled so the curve never goes NaN.
    """
    idx = pd.DatetimeIndex(dates)
    close = panel.close[symbol].reindex(idx)
    valid = close.dropna()
    if valid.empty:
        return pd.Series(float(starting_cash), index=idx, name="benchmark")
    first_t = valid.index[0]
    units = starting_cash / float(valid.iloc[0])
    held = close.ffill() * units
    curve = held.where(idx >= first_t, other=float(starting_cash))
    return pd.Series(curve.to_numpy(dtype=float), index=idx, name="benchmark")


def run_backtest(spec: StrategySpec, panel, starting_cash: float = 10_000.0) -> BacktestResult:
    close = panel.close
    if isinstance(spec.universe, list):
        symbols = [s for s in spec.universe if s in close.columns]
        close = close[symbols]
    indicators = compute_all(spec.indicators, close)

    mask = (close.index >= pd.Timestamp(spec.start)) & (close.index <= pd.Timestamp(spec.end))
    dates = list(close.index[mask])

    pf = Portfolio(cash=starting_cash, positions={})
    ts_state: dict[str, bool] = {}
    pending_target: dict[str, float] | None = None
    prev_t: pd.Timestamp | None = None

    equity: list[float] = []
    trades: list[dict] = []

    for t in dates:
        # 1) Execute any target decided on the previous bar, at THIS bar's open.
        if pending_target is not None:
            tradable_now = [s for s in close.columns if panel.is_tradable(s, t)]
            fill_prices = {s: panel.open_at(s, t) for s in tradable_now}
            if pf.positions and prev_t is not None:
                mark = {s: panel.close.loc[prev_t, s] for s in pf.positions}
                pv = pf.value(mark)
            else:
                pv = pf.cash
            fills = rebalance_to_weights(
                pf,
                target_weights={s: w for s, w in pending_target.items() if s in fill_prices},
                fill_prices=fill_prices,
                portfolio_value=pv,
                fee_bps=spec.costs.fee_bps,
                slippage_bps=spec.costs.slippage_bps,
            )
            for s, d in fills.items():
                trades.append({"date": t, "symbol": s, "units": d, "price": fill_prices[s]})
            pending_target = None

        # 2) Mark to market at THIS bar's close.
        mark_prices = {s: panel.close_at(s, t) for s in pf.positions if panel.is_tradable(s, t)}
        equity.append(pf.value(mark_prices))

        # 3) Decide a new target from data <= t, to be filled NEXT bar.
        if _is_rebalance_day(spec.rebalance, t):
            tradable = [s for s in close.columns if panel.is_tradable(s, t)]
            rows = {iid: frame.loc[t] for iid, frame in indicators.items()}
            pending_target = target_weights(spec.selection, spec.sizing, rows, tradable, ts_state)

        prev_t = t

    benchmark_curve = None
    if spec.benchmark in panel.close.columns:
        benchmark_curve = build_benchmark_curve(panel, spec.benchmark, dates, starting_cash)

    return BacktestResult(
        equity_curve=pd.Series(equity, index=pd.DatetimeIndex(dates), name="equity"),
        trade_log=pd.DataFrame(trades),
        spec=spec,
        benchmark_curve=benchmark_curve,
    )
