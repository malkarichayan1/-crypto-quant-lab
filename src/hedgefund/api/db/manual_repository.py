from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from hedgefund.api.db.manual_models import (
    ManualOrderRow,
    PortfolioEquityRow,
    PortfolioRow,
    WatchlistRow,
)


class ManualRepository:
    """Data access for the beginner (manual-trading) surfaces. Caller commits."""

    def __init__(self, session: Session) -> None:
        self._s = session

    def list_watchlist(self) -> list[str]:
        stmt = select(WatchlistRow).order_by(WatchlistRow.starred_at, WatchlistRow.symbol)
        return [row.symbol for row in self._s.scalars(stmt)]

    def star(self, symbol: str) -> None:
        if self._s.get(WatchlistRow, symbol) is None:
            self._s.add(WatchlistRow(symbol=symbol))
            self._s.flush()

    def unstar(self, symbol: str) -> None:
        row = self._s.get(WatchlistRow, symbol)
        if row is not None:
            self._s.delete(row)
            self._s.flush()

    # ---- portfolios (Phase 3) ----

    def get_active_portfolio(self) -> PortfolioRow | None:
        stmt = select(PortfolioRow).order_by(PortfolioRow.created_at.desc()).limit(1)
        return self._s.scalars(stmt).first()

    def create_portfolio(self, starting_cash: float) -> PortfolioRow:
        row = PortfolioRow(id=uuid.uuid4(), starting_cash=starting_cash)
        self._s.add(row)
        self._s.flush()
        return row

    def get_or_create_active_portfolio(self, default_cash: float) -> PortfolioRow:
        return self.get_active_portfolio() or self.create_portfolio(default_cash)

    def list_orders(self, portfolio_id: uuid.UUID) -> list[ManualOrderRow]:
        stmt = (
            select(ManualOrderRow)
            .where(ManualOrderRow.portfolio_id == portfolio_id)
            .order_by(ManualOrderRow.created_at)
        )
        return list(self._s.scalars(stmt).all())

    def add_order(
        self, portfolio_id: uuid.UUID, *, symbol: str, side: str,
        usd_amount: float, units: float, fill_price: float,
    ) -> ManualOrderRow:
        row = ManualOrderRow(
            id=uuid.uuid4(), portfolio_id=portfolio_id, symbol=symbol, side=side,
            usd_amount=usd_amount, units=units, fill_price=fill_price,
        )
        self._s.add(row)
        self._s.flush()
        return row

    def add_equity_point(self, portfolio_id: uuid.UUID, ts: datetime, equity: float) -> None:
        self._s.add(PortfolioEquityRow(
            id=uuid.uuid4(), portfolio_id=portfolio_id, ts=ts, equity=equity,
        ))
        self._s.flush()

    def list_equity(
        self, portfolio_id: uuid.UUID, since: datetime | None
    ) -> list[PortfolioEquityRow]:
        stmt = (
            select(PortfolioEquityRow)
            .where(PortfolioEquityRow.portfolio_id == portfolio_id)
            .order_by(PortfolioEquityRow.ts)
        )
        if since is not None:
            stmt = stmt.where(PortfolioEquityRow.ts >= since)
        return list(self._s.scalars(stmt).all())
