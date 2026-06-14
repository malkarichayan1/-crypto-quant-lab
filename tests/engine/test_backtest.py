from datetime import date

from hedgefund.dsl.spec import (
    Costs,
    CrossSectionalSelection,
    MomentumIndicator,
    Sizing,
    StrategySpec,
)
from hedgefund.engine.backtest import run_backtest
from tests.fixtures.panels import single_asset_panel


def _hold_one_asset_spec(start, end, fee_bps=0.0, slippage_bps=0.0) -> StrategySpec:
    return StrategySpec(
        name="hold",
        universe=["AAA"],
        indicators=[MomentumIndicator(type="momentum", id="m1", lookback=1)],
        selection=CrossSectionalSelection(
            mode="cross_sectional", rank_by="m1", long_top=1, short_bottom=0
        ),
        sizing=Sizing(scheme="equal_weight", gross_leverage=1.0),
        rebalance="daily",
        costs=Costs(fee_bps=fee_bps, slippage_bps=slippage_bps),
        start=start,
        end=end,
    )


def test_buy_and_hold_identity_no_costs():
    panel = single_asset_panel([100.0, 110.0, 121.0, 133.1])
    spec = _hold_one_asset_spec(date(2020, 1, 1), date(2020, 1, 4))
    result = run_backtest(spec, panel, starting_cash=1000.0)
    eq = result.equity_curve
    # Decision first possible at bar 1 (needs lookback 1), fills at bar 2 open=110.
    # Once fully long, terminal/entry equity ratio == price ratio over holding window.
    held_return = 133.1 / 110.0
    entry_equity = eq.iloc[1]
    assert abs(eq.iloc[-1] / entry_equity - held_return) < 1e-6


def test_costs_reduce_terminal_equity():
    panel = single_asset_panel([100.0, 110.0, 121.0, 133.1])
    no_cost = run_backtest(
        _hold_one_asset_spec(date(2020, 1, 1), date(2020, 1, 4)), panel, starting_cash=1000.0
    )
    with_cost = run_backtest(
        _hold_one_asset_spec(date(2020, 1, 1), date(2020, 1, 4), fee_bps=10, slippage_bps=5),
        panel,
        starting_cash=1000.0,
    )
    assert with_cost.equity_curve.iloc[-1] < no_cost.equity_curve.iloc[-1]


def test_result_is_deterministic():
    panel = single_asset_panel([100.0, 110.0, 121.0, 133.1])
    spec = _hold_one_asset_spec(date(2020, 1, 1), date(2020, 1, 4))
    a = run_backtest(spec, panel, starting_cash=1000.0)
    b = run_backtest(spec, panel, starting_cash=1000.0)
    assert list(a.equity_curve) == list(b.equity_curve)
