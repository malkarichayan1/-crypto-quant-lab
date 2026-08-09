from __future__ import annotations

import uuid
import zlib
from datetime import datetime

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from hedgefund.api.db.manual_models import (
    AdviceLogRow,
    ManualOrderRow,
    PortfolioEquityRow,
    PortfolioRow,
    WatchlistRow,
)

# Fixed key for the Postgres transaction-scoped advisory lock that serializes
# concurrent "bootstrap the first portfolio" attempts (see
# get_or_create_active_portfolio below). Any stable int64 works; derived via
# crc32 of a namespacing string purely so it doesn't collide by coincidence
# with an advisory lock key used elsewhere.
_PORTFOLIO_BOOTSTRAP_LOCK_KEY = zlib.crc32(b"hedgefund.manual.portfolio_bootstrap")


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
        # Double-checked locking: the overwhelming majority of calls, forever
        # after the very first request against a fresh database, find an
        # existing portfolio here and return immediately without ever
        # touching the lock. We only pay the lock's round-trip (and briefly
        # hold it) on the rare path where none exists yet.
        existing = self.get_active_portfolio()
        if existing is not None:
            return existing

        # Serialize concurrent bootstrap attempts (e.g. a browser firing
        # GET /portfolio and GET /portfolio/orders in parallel on first
        # load, against an empty database) so two callers can't each see
        # "no active portfolio" and both create one, orphaning the loser.
        # Transaction-scoped: acquired here, released automatically on this
        # session's next commit or rollback — no separate unlock needed.
        #
        # Deliberately NOT held for the rest of the caller's transaction:
        # callers like get_portfolio_view() do further work (up to ~20
        # sequential ccxt calls on a cold market-data cache) before their
        # own commit. Locking only around this recheck-then-create keeps
        # that unrelated work from serializing behind a single global lock
        # once a portfolio already exists.
        self._s.execute(
            text("SELECT pg_advisory_xact_lock(:key)"),
            {"key": _PORTFOLIO_BOOTSTRAP_LOCK_KEY},
        )
        # Recheck: another caller may have created one while we were
        # blocked waiting for the lock.
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

    # ---- advice cache (Phase 4) ----

    def get_fresh_advice(
        self, portfolio_id: uuid.UUID, *, scope: str, not_before: datetime
    ) -> AdviceLogRow | None:
        """Newest advice row for this (portfolio, scope) generated at or after
        `not_before`. The TTL lives in the service layer, which computes the
        cutoff — the repository only answers 'is there one this recent'."""
        stmt = (
            select(AdviceLogRow)
            .where(
                AdviceLogRow.portfolio_id == portfolio_id,
                AdviceLogRow.scope == scope,
                AdviceLogRow.generated_at >= not_before,
            )
            .order_by(AdviceLogRow.generated_at.desc())
            .limit(1)
        )
        return self._s.scalars(stmt).first()

    def add_advice(
        self, portfolio_id: uuid.UUID, *, scope: str, payload: dict
    ) -> AdviceLogRow:
        row = AdviceLogRow(
            id=uuid.uuid4(), portfolio_id=portfolio_id, scope=scope, payload=payload
        )
        self._s.add(row)
        self._s.flush()
        return row

    def clear_advice(self, portfolio_id: uuid.UUID) -> int:
        """Drop every cached scope for this portfolio. Called when an order
        fills — a new position invalidates portfolio-wide *and* per-coin advice.
        Returns the number of rows removed."""
        result = self._s.execute(
            delete(AdviceLogRow).where(AdviceLogRow.portfolio_id == portfolio_id)
        )
        self._s.flush()
        return result.rowcount
