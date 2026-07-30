from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from hedgefund.api.db.manual_models import WatchlistRow


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
