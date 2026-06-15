from __future__ import annotations

import uuid

from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.orm import Session

from hedgefund.api.db.models import BacktestRow


class BacktestRepository:
    """The only module that touches SQL. Accepts a session, returns ORM rows."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        *,
        name: str,
        spec: dict,
        equity_curve: list,
        benchmark_curve: list | None,
        trade_log: list,
        metrics: dict,
        starting_cash: float,
        duration_ms: int,
    ) -> BacktestRow:
        row = BacktestRow(
            name=name,
            spec=spec,
            equity_curve=equity_curve,
            benchmark_curve=benchmark_curve,
            trade_log=trade_log,
            metrics=metrics,
            starting_cash=starting_cash,
            duration_ms=duration_ms,
        )
        self._session.add(row)
        self._session.flush()
        self._session.refresh(row)
        return row

    def get(self, backtest_id: uuid.UUID) -> BacktestRow | None:
        return self._session.get(BacktestRow, backtest_id)

    def list(self) -> list[BacktestRow]:
        stmt = select(BacktestRow).order_by(BacktestRow.created_at.desc())
        return list(self._session.scalars(stmt).all())

    def delete(self, backtest_id: uuid.UUID) -> bool:
        result = self._session.execute(
            sa_delete(BacktestRow).where(BacktestRow.id == backtest_id)
        )
        return result.rowcount > 0
