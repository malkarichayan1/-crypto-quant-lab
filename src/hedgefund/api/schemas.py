from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from hedgefund.dsl.spec import StrategySpec


class CreateBacktestRequest(BaseModel):
    spec: StrategySpec
    starting_cash: float = Field(default=10_000.0, gt=0)


class BacktestSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime
    duration_ms: int
    metrics: dict[str, float]


class BacktestResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime
    duration_ms: int
    starting_cash: float
    spec: dict
    equity_curve: list[list]
    benchmark_curve: list[list] | None
    trade_log: list[dict]
    metrics: dict[str, float]
