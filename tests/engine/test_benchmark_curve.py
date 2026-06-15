from datetime import date

import numpy as np
import pandas as pd
import pytest

from hedgefund.data.panel import FIELDS, PricePanel
from hedgefund.dsl.spec import (
    Costs,
    CrossSectionalSelection,
    MomentumIndicator,
    Sizing,
    StrategySpec,
)
from hedgefund.engine.backtest import build_benchmark_curve, run_backtest
from tests.fixtures.panels import single_asset_panel, two_asset_panel


def test_benchmark_curve_tracks_buy_and_hold_price():
    panel = single_asset_panel([100.0, 110.0, 121.0, 133.1])
    dates = list(panel.dates)
    curve = build_benchmark_curve(panel, "AAA", dates, starting_cash=1000.0)
    assert curve.iloc[0] == pytest.approx(1000.0)
    assert curve.iloc[-1] / curve.iloc[0] == pytest.approx(133.1 / 100.0)
    assert list(curve.index) == dates


def test_benchmark_curve_flat_cash_until_symbol_listed():
    panel = two_asset_panel()  # AAA close is NaN on bar 0 (pre-listing)
    dates = list(panel.dates)
    curve = build_benchmark_curve(panel, "AAA", dates, starting_cash=1000.0)
    assert curve.iloc[0] == pytest.approx(1000.0)  # held cash before listing
    # listed at bar 1 (close 100) -> still 1000; bar 2 (close 110) -> 1100
    assert curve.iloc[2] / curve.iloc[1] == pytest.approx(110.0 / 100.0)


def test_benchmark_curve_all_nan_symbol_is_flat_cash():
    idx = pd.date_range("2020-01-01", periods=3, freq="D")
    nan_col = pd.DataFrame({"AAA": [np.nan, np.nan, np.nan]}, index=idx)
    panel = PricePanel.from_field_frames({f: nan_col for f in FIELDS})
    curve = build_benchmark_curve(panel, "AAA", list(idx), starting_cash=1000.0)
    assert (curve == 1000.0).all()


def _spec(universe, benchmark, end) -> StrategySpec:
    return StrategySpec(
        name="b",
        universe=universe,
        indicators=[MomentumIndicator(type="momentum", id="m1", lookback=1)],
        selection=CrossSectionalSelection(
            mode="cross_sectional", rank_by="m1", long_top=1, short_bottom=0
        ),
        sizing=Sizing(scheme="equal_weight", gross_leverage=1.0),
        rebalance="daily",
        costs=Costs(fee_bps=0, slippage_bps=0),
        start=date(2020, 1, 1),
        end=end,
        benchmark=benchmark,
    )


def test_run_backtest_attaches_aligned_benchmark_curve():
    panel = two_asset_panel()  # columns AAA, BBB
    spec = _spec(universe=["BBB"], benchmark="AAA", end=date(2020, 1, 3))
    result = run_backtest(spec, panel, starting_cash=1000.0)
    assert result.benchmark_curve is not None
    assert list(result.benchmark_curve.index) == list(result.equity_curve.index)


def test_run_backtest_benchmark_curve_none_when_symbol_absent():
    panel = single_asset_panel([100.0, 110.0, 121.0])  # only column AAA
    spec = _spec(universe=["AAA"], benchmark="ZZZ", end=date(2020, 1, 3))
    result = run_backtest(spec, panel, starting_cash=1000.0)
    assert result.benchmark_curve is None
