from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update as sa_update
from sqlalchemy.orm import Session

from hedgefund.api.db.paper_models import PaperEquityRow, PaperSessionRow, PaperTradeRow


class PaperRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def create_session(
        self,
        *,
        label: str,
        spec_json: dict,
        source_backtest_id: uuid.UUID | None,
        universe: list[str],
        timeframe: str,
        starting_cash: float,
        state_json: dict,
    ) -> PaperSessionRow:
        row = PaperSessionRow(
            id=uuid.uuid4(),
            label=label,
            spec_json=spec_json,
            source_backtest_id=source_backtest_id,
            universe=universe,
            timeframe=timeframe,
            starting_cash=starting_cash,
            status="active",
            state_json=state_json,
        )
        self._s.add(row)
        self._s.flush()
        return row

    def get_session(self, session_id: uuid.UUID) -> PaperSessionRow | None:
        return self._s.get(PaperSessionRow, session_id)

    def get_status(self, session_id: uuid.UUID) -> str | None:
        row = self._s.get(PaperSessionRow, session_id)
        return row.status if row else None

    def list_sessions(self) -> list[PaperSessionRow]:
        stmt = select(PaperSessionRow).order_by(PaperSessionRow.created_at.desc())
        return list(self._s.scalars(stmt).all())

    def list_active_sessions(self) -> list[PaperSessionRow]:
        stmt = select(PaperSessionRow).where(PaperSessionRow.status == "active")
        return list(self._s.scalars(stmt).all())

    def list_trades(self, session_id: uuid.UUID) -> list[PaperTradeRow]:
        stmt = (
            select(PaperTradeRow)
            .where(PaperTradeRow.session_id == session_id)
            .order_by(PaperTradeRow.ts)
        )
        return list(self._s.scalars(stmt).all())

    def list_equity(self, session_id: uuid.UUID) -> list[PaperEquityRow]:
        stmt = (
            select(PaperEquityRow)
            .where(PaperEquityRow.session_id == session_id)
            .order_by(PaperEquityRow.ts)
        )
        return list(self._s.scalars(stmt).all())

    def record_tick(
        self,
        *,
        session_id: uuid.UUID,
        state_json: dict,
        fills: list[dict],
        equity: float,
        ts: datetime,
        is_catchup: bool,
    ) -> None:
        """Persist one processed candle: update session state + high-water mark,
        append one equity point, append a trade row per fill. Caller commits."""
        for f in fills:
            self._s.add(PaperTradeRow(
                id=uuid.uuid4(), session_id=session_id, ts=ts,
                symbol=f["symbol"], units=f["units"], price=f["price"],
                is_catchup=is_catchup,
            ))
        self._s.add(PaperEquityRow(id=uuid.uuid4(), session_id=session_id, ts=ts, equity=equity))
        self._s.execute(
            sa_update(PaperSessionRow)
            .where(PaperSessionRow.id == session_id)
            .values(state_json=state_json, last_processed_ts=ts)
        )

    def stop_session(self, session_id: uuid.UUID) -> None:
        self._s.execute(
            sa_update(PaperSessionRow)
            .where(PaperSessionRow.id == session_id)
            .values(status="stopped", stopped_at=datetime.now(timezone.utc))
        )

    def set_error(self, session_id: uuid.UUID, message: str) -> None:
        self._s.execute(
            sa_update(PaperSessionRow)
            .where(PaperSessionRow.id == session_id)
            .values(status="error", error=message)
        )
