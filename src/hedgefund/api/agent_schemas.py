from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class CreateAgentRunRequest(BaseModel):
    goal: str = Field(min_length=1)
    universe: list[str] = Field(min_length=1)
    date_start: date
    date_end: date
    starting_cash: float = Field(default=10_000.0, gt=0)
    budget_usd: float = Field(gt=0)
    target_metric: str | None = None
    target_value: float | None = None


class AgentRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    goal: str
    universe: list
    date_start: date
    date_end: date
    starting_cash: float
    budget_usd: float
    target_metric: str | None
    target_value: float | None
    model: str
    status: str
    cost_usd: float
    winner_backtest_id: uuid.UUID | None
    created_at: datetime
    finished_at: datetime | None


class AgentIterationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    run_id: uuid.UUID
    iteration_index: int
    research_note: str | None
    spec_json: dict | None
    backtest_id: uuid.UUID | None
    metrics_snapshot: dict | None
    critic_note: str | None
    failed: bool
    created_at: datetime


class AgentRunDetailResponse(AgentRunResponse):
    iterations: list[AgentIterationSummary] = []
