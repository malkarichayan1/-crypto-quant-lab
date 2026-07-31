from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Protocol

MIN_ORDER_USD = 1.0
# Dollar-scale float tolerance: exact-balance orders ("Max") must not be
# rejected for representation error.
_EPSILON = 1e-6


class OrderLike(Protocol):
    symbol: str
    side: str
    usd_amount: float
    units: float
    fill_price: float


class OrderValidationError(ValueError):
    """Raised with a user-friendly message when an order cannot be filled."""


@dataclass(frozen=True)
class Holding:
    units: float
    avg_cost: float


@dataclass(frozen=True)
class PositionView:
    symbol: str
    units: float
    avg_cost: float
    price: float
    market_value: float
    unrealized_pl: float
    unrealized_pl_pct: float
    change_24h_pl: float


@dataclass(frozen=True)
class PortfolioTotals:
    equity: float
    today_pl: float
    total_return_pct: float


def derive_cash(starting_cash: float, orders: Iterable[OrderLike]) -> float:
    cash = starting_cash
    for order in orders:
        cash += order.usd_amount if order.side == "sell" else -order.usd_amount
    return cash


def derive_holdings(orders: Iterable[OrderLike]) -> dict[str, Holding]:
    holdings: dict[str, Holding] = {}
    for order in orders:
        held = holdings.get(order.symbol, Holding(0.0, 0.0))
        if order.side == "buy":
            total_units = held.units + order.units
            avg_cost = (
                held.units * held.avg_cost + order.units * order.fill_price
            ) / total_units
            holdings[order.symbol] = Holding(total_units, avg_cost)
        else:
            remaining = held.units - order.units
            if remaining <= _EPSILON:
                holdings.pop(order.symbol, None)
            else:
                holdings[order.symbol] = Holding(remaining, held.avg_cost)
    return holdings


def units_for(usd_amount: float, price: float) -> float:
    return usd_amount / price


def validate_order(
    side: str, usd_amount: float, *, price: float, cash: float, held_units: float
) -> None:
    if usd_amount < MIN_ORDER_USD:
        raise OrderValidationError(f"Orders must be at least ${MIN_ORDER_USD:.2f}.")
    if side == "buy" and usd_amount > cash + _EPSILON:
        raise OrderValidationError(
            f"Not enough buying power — you have ${cash:,.2f} available."
        )
    if side == "sell":
        held_value = held_units * price
        if usd_amount > held_value + _EPSILON:
            raise OrderValidationError(
                f"You only hold ${held_value:,.2f} of this coin."
            )


def position_view(
    symbol: str, holding: Holding, *, price: float, price_24h_ago: float
) -> PositionView:
    market_value = holding.units * price
    cost = holding.units * holding.avg_cost
    unrealized = market_value - cost
    return PositionView(
        symbol=symbol,
        units=holding.units,
        avg_cost=holding.avg_cost,
        price=price,
        market_value=market_value,
        unrealized_pl=unrealized,
        unrealized_pl_pct=unrealized / cost if cost > _EPSILON else 0.0,
        change_24h_pl=holding.units * (price - price_24h_ago),
    )


def compute_totals(
    *, starting_cash: float, cash: float, positions: Sequence[PositionView]
) -> PortfolioTotals:
    equity = cash + sum(p.market_value for p in positions)
    return PortfolioTotals(
        equity=equity,
        today_pl=sum(p.change_24h_pl for p in positions),
        total_return_pct=(equity - starting_cash) / starting_cash,
    )
