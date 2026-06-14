import math

from hedgefund.engine.portfolio import Portfolio
from hedgefund.engine.orders import rebalance_to_weights


def test_buy_uses_fill_price_and_charges_costs():
    pf = Portfolio(cash=1000.0, positions={})
    fills = rebalance_to_weights(
        pf,
        target_weights={"AAA": 1.0},
        fill_prices={"AAA": 100.0},
        portfolio_value=1000.0,
        fee_bps=10.0,
        slippage_bps=5.0,
    )
    assert abs(pf.positions["AAA"] - 10.0) < 1e-9
    notional = pf.positions["AAA"] * 100.0
    assert abs(notional - 1000.0) < 1e-6
    assert abs(pf.cash - (1000.0 - notional - 1.5)) < 1e-6
    assert fills["AAA"] == pf.positions["AAA"]


def test_no_trade_when_already_on_target():
    pf = Portfolio(cash=0.0, positions={"AAA": 10.0})
    fills = rebalance_to_weights(
        pf,
        target_weights={"AAA": 1.0},
        fill_prices={"AAA": 100.0},
        portfolio_value=1000.0,
        fee_bps=10.0,
        slippage_bps=5.0,
    )
    assert fills == {}
    assert pf.cash == 0.0


def test_nan_fill_price_is_skipped_not_poisoning_cash():
    pf = Portfolio(cash=1000.0, positions={})
    fills = rebalance_to_weights(
        pf,
        target_weights={"AAA": 1.0},
        fill_prices={"AAA": float("nan")},
        portfolio_value=1000.0,
        fee_bps=10.0,
        slippage_bps=5.0,
    )
    assert fills == {}
    assert pf.cash == 1000.0
    assert math.isfinite(pf.cash)


def test_mark_to_market_value():
    pf = Portfolio(cash=500.0, positions={"AAA": 5.0})
    assert pf.value({"AAA": 100.0}) == 1000.0
