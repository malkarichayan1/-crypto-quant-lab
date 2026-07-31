from __future__ import annotations

from dataclasses import dataclass

import pytest

from hedgefund.manual.portfolio_math import (
    Holding,
    OrderValidationError,
    compute_totals,
    derive_cash,
    derive_holdings,
    position_view,
    units_for,
    validate_order,
)


@dataclass(frozen=True)
class Order:
    symbol: str
    side: str
    usd_amount: float
    units: float
    fill_price: float


def buy(symbol, usd, price):
    return Order(symbol, "buy", usd, usd / price, price)


def sell(symbol, usd, price):
    return Order(symbol, "sell", usd, usd / price, price)


class TestDeriveCash:
    def test_no_orders(self):
        assert derive_cash(100_000.0, []) == 100_000.0

    def test_buys_reduce_and_sells_add(self):
        orders = [buy("BTC", 1_000.0, 100.0), sell("BTC", 400.0, 80.0)]
        assert derive_cash(100_000.0, orders) == pytest.approx(99_400.0)


class TestDeriveHoldings:
    def test_single_buy(self):
        h = derive_holdings([buy("BTC", 1_000.0, 100.0)])
        assert h["BTC"] == Holding(units=10.0, avg_cost=100.0)

    def test_two_buys_weighted_avg_cost(self):
        h = derive_holdings([buy("BTC", 1_000.0, 100.0), buy("BTC", 1_000.0, 200.0)])
        # 10 units @100 + 5 units @200 → 15 units, avg (1000+1000)/15
        assert h["BTC"].units == pytest.approx(15.0)
        assert h["BTC"].avg_cost == pytest.approx(2_000.0 / 15.0)

    def test_sell_reduces_units_keeps_avg_cost(self):
        h = derive_holdings([buy("BTC", 1_000.0, 100.0), sell("BTC", 500.0, 125.0)])
        assert h["BTC"].units == pytest.approx(6.0)  # 10 - 4
        assert h["BTC"].avg_cost == pytest.approx(100.0)

    def test_sell_all_removes_position(self):
        h = derive_holdings([buy("BTC", 1_000.0, 100.0), sell("BTC", 1_000.0, 100.0)])
        assert "BTC" not in h

    def test_symbols_are_independent(self):
        h = derive_holdings([buy("BTC", 1_000.0, 100.0), buy("ETH", 500.0, 10.0)])
        assert h["BTC"].units == pytest.approx(10.0)
        assert h["ETH"].units == pytest.approx(50.0)


class TestUnitsFor:
    def test_division(self):
        assert units_for(250.0, 100.0) == pytest.approx(2.5)


class TestValidateOrder:
    def test_minimum_order(self):
        with pytest.raises(OrderValidationError, match="at least"):
            validate_order("buy", 0.5, price=100.0, cash=1_000.0, held_units=0.0)

    def test_buy_exactly_all_cash_is_allowed(self):
        validate_order("buy", 1_000.0, price=100.0, cash=1_000.0, held_units=0.0)

    def test_buy_over_cash_rejected_with_friendly_message(self):
        with pytest.raises(OrderValidationError, match=r"\$1,000\.00"):
            validate_order("buy", 1_000.01, price=100.0, cash=1_000.0, held_units=0.0)

    def test_sell_up_to_held_value_allowed(self):
        validate_order("sell", 500.0, price=100.0, cash=0.0, held_units=5.0)

    def test_sell_over_held_value_rejected(self):
        with pytest.raises(OrderValidationError, match="only hold"):
            validate_order("sell", 501.0, price=100.0, cash=0.0, held_units=5.0)


class TestPositionView:
    def test_pnl_math(self):
        view = position_view("BTC", Holding(units=10.0, avg_cost=100.0),
                             price=110.0, price_24h_ago=105.0)
        assert view.market_value == pytest.approx(1_100.0)
        assert view.unrealized_pl == pytest.approx(100.0)
        assert view.unrealized_pl_pct == pytest.approx(0.1)
        assert view.change_24h_pl == pytest.approx(50.0)


class TestComputeTotals:
    def test_equity_today_and_return(self):
        positions = [
            position_view("BTC", Holding(10.0, 100.0), price=110.0, price_24h_ago=105.0),
        ]
        totals = compute_totals(starting_cash=100_000.0, cash=99_000.0, positions=positions)
        assert totals.equity == pytest.approx(100_100.0)
        assert totals.today_pl == pytest.approx(50.0)
        assert totals.total_return_pct == pytest.approx(0.001)
