from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select, update as sa_update
from sqlalchemy.orm import Session

from hedgefund.api.db.agent_models import AgentIterationRow, AgentRunRow


class AgentRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def create_run(
        self,
        *,
        goal: str,
        universe: list[str],
        date_start: date,
        date_end: date,
        starting_cash: float,
        budget_usd: float,
        target_metric: str | None,
        target_value: float | None,
        model: str,
    ) -> AgentRunRow:
        row = AgentRunRow(
            id=uuid.uuid4(),
            goal=goal,
            universe=universe,
            date_start=date_start,
            date_end=date_end,
            starting_cash=starting_cash,
            budget_usd=budget_usd,
            target_metric=target_metric,
            target_value=target_value,
            model=model,
            status="pending",
            cost_usd=0.0,
        )
        self._s.add(row)
        self._s.flush()
        return row

    def get_run(self, run_id: uuid.UUID) -> AgentRunRow | None:
        return self._s.get(AgentRunRow, run_id)

    def list_runs(self) -> list[AgentRunRow]:
        stmt = select(AgentRunRow).order_by(AgentRunRow.created_at.desc())
        return list(self._s.scalars(stmt).all())

    def update_run_status(self, run_id: uuid.UUID, status: str) -> None:
        self._s.execute(
            sa_update(AgentRunRow)
            .where(AgentRunRow.id == run_id)
            .values(status=status)
        )

    def update_run_cost(self, run_id: uuid.UUID, cost_usd: float) -> None:
        self._s.execute(
            sa_update(AgentRunRow)
            .where(AgentRunRow.id == run_id)
            .values(cost_usd=cost_usd)
        )

    def finish_run(
        self,
        run_id: uuid.UUID,
        *,
        cost_usd: float,
        winner_backtest_id: uuid.UUID | None,
        status: str = "done",
    ) -> None:
        self._s.execute(
            sa_update(AgentRunRow)
            .where(AgentRunRow.id == run_id)
            .values(
                status=status,
                cost_usd=cost_usd,
                winner_backtest_id=winner_backtest_id,
                finished_at=datetime.now(timezone.utc),
            )
        )

    def list_iterations(self, run_id: uuid.UUID) -> list[AgentIterationRow]:
        stmt = (
            select(AgentIterationRow)
            .where(AgentIterationRow.run_id == run_id)
            .order_by(AgentIterationRow.iteration_index)
        )
        return list(self._s.scalars(stmt).all())

    def create_iteration(
        self,
        *,
        run_id: uuid.UUID,
        iteration_index: int,
        research_note: str | None,
        spec_json: dict | None,
        backtest_id: uuid.UUID | None,
        metrics_snapshot: dict | None,
        critic_note: str | None,
        failed: bool,
    ) -> AgentIterationRow:
        row = AgentIterationRow(
            id=uuid.uuid4(),
            run_id=run_id,
            iteration_index=iteration_index,
            research_note=research_note,
            spec_json=spec_json,
            backtest_id=backtest_id,
            metrics_snapshot=metrics_snapshot,
            critic_note=critic_note,
            failed=failed,
        )
        self._s.add(row)
        self._s.flush()
        return row

    def mark_stale_runs_failed(self) -> int:
        """On startup: mark any 'running'/'pending' runs as 'failed'."""
        result = self._s.execute(
            sa_update(AgentRunRow)
            .where(AgentRunRow.status.in_(["running", "pending"]))
            .values(status="failed", finished_at=datetime.now(timezone.utc))
        )
        return result.rowcount
