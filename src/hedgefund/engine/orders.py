from __future__ import annotations

from hedgefund.engine.portfolio import Portfolio

_EPS = 1e-9


def rebalance_to_weights(
    portfolio: Portfolio,
    target_weights: dict[str, float],
    fill_prices: dict[str, float],
    portfolio_value: float,
    fee_bps: float,
    slippage_bps: float,
) -> dict[str, float]:
    """Move the portfolio toward target weights, filling at `fill_prices`.

    Costs (fee + slippage) are charged on traded notional and debited from cash.
    Returns {symbol: filled_units_delta} for symbols actually traded. Mutates the
    portfolio in place.
    """
    cost_rate = (fee_bps + slippage_bps) / 1e4
    fills: dict[str, float] = {}
    symbols = set(target_weights) | set(portfolio.positions)
    for sym in symbols:
        price = fill_prices.get(sym)
        if price is None or price <= 0:
            continue
        target_units = target_weights.get(sym, 0.0) * portfolio_value / price
        current_units = portfolio.positions.get(sym, 0.0)
        delta = target_units - current_units
        if abs(delta) < _EPS:
            continue
        traded_notional = abs(delta) * price
        cost = traded_notional * cost_rate
        portfolio.cash -= delta * price + cost
        new_units = current_units + delta
        if abs(new_units) < _EPS:
            portfolio.positions.pop(sym, None)
        else:
            portfolio.positions[sym] = new_units
        fills[sym] = delta
    return fills
