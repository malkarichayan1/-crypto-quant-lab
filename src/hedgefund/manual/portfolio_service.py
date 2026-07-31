from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from hedgefund.manual import portfolio_math as pm
from hedgefund.manual.market_data import (
    AssetQuote,
    MarketDataProvider,
    PricesUnavailableError,
    UnknownSymbolError,
)

DEFAULT_STARTING_CASH = 100_000.0
EQUITY_RANGE_DAYS: dict[str, int | None] = {
    "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365, "ALL": None,
}


@dataclass(frozen=True)
class PortfolioViewData:
    portfolio_id: uuid.UUID
    starting_cash: float
    cash: float
    positions: tuple[pm.PositionView, ...]
    equity: float
    today_pl: float
    total_return_pct: float
    stale: bool
    created_at: datetime


def _price_24h_ago(quote: AssetQuote) -> float:
    return quote.sparkline[0] if quote.sparkline else quote.price


def get_portfolio_view(repo, market: MarketDataProvider) -> PortfolioViewData:
    """Assemble the full portfolio payload. May create the bootstrap portfolio —
    the caller commits."""
    portfolio = repo.get_or_create_active_portfolio(DEFAULT_STARTING_CASH)
    orders = repo.list_orders(portfolio.id)
    cash = pm.derive_cash(portfolio.starting_cash, orders)
    holdings = pm.derive_holdings(orders)

    snapshot = market.get_assets()
    quotes = {q.symbol: q for q in snapshot.assets}
    positions = []
    for symbol in sorted(holdings):
        quote = quotes.get(symbol)
        if quote is None:  # held coin missing from the snapshot → cannot price
            raise PricesUnavailableError(symbol)
        positions.append(
            pm.position_view(
                symbol, holdings[symbol],
                price=quote.price, price_24h_ago=_price_24h_ago(quote),
            )
        )

    totals = pm.compute_totals(
        starting_cash=portfolio.starting_cash, cash=cash, positions=positions
    )
    return PortfolioViewData(
        portfolio_id=portfolio.id,
        starting_cash=portfolio.starting_cash,
        cash=cash,
        positions=tuple(positions),
        equity=totals.equity,
        today_pl=totals.today_pl,
        total_return_pct=totals.total_return_pct,
        stale=snapshot.stale,
        created_at=portfolio.created_at,
    )


def place_order(repo, market: MarketDataProvider, *, symbol: str, side: str, usd_amount: float):
    """Validate and fill a market order at the latest cached price. Caller commits.

    Raises OrderValidationError (400), UnknownSymbolError (404),
    PricesUnavailableError (503)."""
    portfolio = repo.get_or_create_active_portfolio(DEFAULT_STARTING_CASH)
    orders = repo.list_orders(portfolio.id)
    cash = pm.derive_cash(portfolio.starting_cash, orders)
    holdings = pm.derive_holdings(orders)

    quotes = {q.symbol: q for q in market.get_assets().assets}
    quote = quotes.get(symbol)
    if quote is None:
        raise UnknownSymbolError(symbol)

    held = holdings.get(symbol, pm.Holding(0.0, 0.0))
    pm.validate_order(side, usd_amount, price=quote.price, cash=cash, held_units=held.units)
    units = pm.units_for(usd_amount, quote.price)
    return repo.add_order(
        portfolio.id, symbol=symbol, side=side,
        usd_amount=usd_amount, units=units, fill_price=quote.price,
    )


def get_equity_series(
    repo, market: MarketDataProvider, range_key: str
) -> list[tuple[datetime, float]]:
    """Snapshots within the range plus a live point computed from current prices."""
    days = EQUITY_RANGE_DAYS[range_key]
    view = get_portfolio_view(repo, market)
    since = datetime.now(timezone.utc) - timedelta(days=days) if days else None
    rows = repo.list_equity(view.portfolio_id, since)
    points = [(row.ts, row.equity) for row in rows]
    points.append((datetime.now(timezone.utc), view.equity))
    return points
