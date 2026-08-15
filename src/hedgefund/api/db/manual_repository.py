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

# Namespace for the Postgres transaction-scoped advisory lock that serializes
# concurrent "bootstrap the first portfolio" attempts for the SAME device
# (see get_or_create_active_portfolio below). Scoped per-device (crc32 of
# this namespace + device_id) so two DIFFERENT devices bootstrapping at the
# same moment never serialize against each other — only concurrent requests
# from the same device do, which is the actual scenario this guards against
# (e.g. a browser firing GET /portfolio and GET /portfolio/orders in
# parallel on first load).
_PORTFOLIO_BOOTSTRAP_LOCK_NAMESPACE = "hedgefund.manual.portfolio_bootstrap"


class ManualRepository:
    """Data access for the beginner (manual-trading) surfaces, scoped to one
    device_id. Caller commits."""

    def __init__(self, session: Session, device_id: str) -> None:
        self._s = session
        self._device_id = device_id

    def list_watchlist(self) -> list[str]:
        stmt = (
            select(WatchlistRow)
            .where(WatchlistRow.device_id == self._device_id)
            .order_by(WatchlistRow.starred_at, WatchlistRow.symbol)
        )
        return [row.symbol for row in self._s.scalars(stmt)]

    def star(self, symbol: str) -> None:
        if self._s.get(WatchlistRow, (self._device_id, symbol)) is None:
            self._s.add(WatchlistRow(device_id=self._device_id, symbol=symbol))
            self._s.flush()

    def unstar(self, symbol: str) -> None:
        row = self._s.get(WatchlistRow, (self._device_id, symbol))
        if row is not None:
            self._s.delete(row)
            self._s.flush()

    # ---- portfolios (Phase 3) ----

    def get_active_portfolio(self) -> PortfolioRow | None:
        stmt = (
            select(PortfolioRow)
            .where(PortfolioRow.device_id == self._device_id)
            .order_by(PortfolioRow.created_at.desc())
            .limit(1)
        )
        return self._s.scalars(stmt).first()

    def create_portfolio(self, starting_cash: float) -> PortfolioRow:
        row = PortfolioRow(id=uuid.uuid4(), device_id=self._device_id, starting_cash=starting_cash)
        self._s.add(row)
        self._s.flush()
        return row

    def get_or_create_active_portfolio(self, default_cash: float) -> PortfolioRow:
        # Double-checked locking: the overwhelming majority of calls, forever
        # after the very first request from a given device, find an
        # existing portfolio here and return immediately without ever
        # touching the lock. We only pay the lock's round-trip (and briefly
        # hold it) on the rare path where none exists yet for this device.
        existing = self.get_active_portfolio()
        if existing is not None:
            return existing

        # Serialize concurrent bootstrap attempts from this SAME device.
        # Transaction-scoped: acquired here, released automatically on this
        # session's next commit or rollback — no separate unlock needed.
        #
        # Deliberately NOT held for the rest of the caller's transaction:
        # callers like get_portfolio_view() do further work (up to ~20
        # sequential ccxt calls on a cold market-data cache) before their
        # own commit. Locking only around this recheck-then-create keeps
        # that unrelated work from serializing behind this device's lock
        # once a portfolio already exists.
        lock_key = zlib.crc32(
            f"{_PORTFOLIO_BOOTSTRAP_LOCK_NAMESPACE}.{self._device_id}".encode()
        )
        self._s.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key}
        )
        # Recheck: another caller for this device may have created one while
        # we were blocked waiting for the lock.
        return self.get_active_portfolio() or self.create_portfolio(default_cash)

    @staticmethod
    def list_active_device_ids(session: Session) -> list[str]:
        """Every distinct device_id with at least one portfolio. Used only by
        the background equity-snapshot loop (equity_snapshots.py), which
        must fan out across every device's active portfolio each cycle —
        deliberately NOT device-scoped, unlike every other method here."""
        stmt = select(PortfolioRow.device_id).distinct()
        return list(session.scalars(stmt).all())

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
