from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CreatePaperSessionRequest(BaseModel):
    label: str = Field(min_length=1)
    source_backtest_id: uuid.UUID | None = None
    spec_json: dict | None = None
    starting_cash: float = Field(default=10_000.0, gt=0)


class PaperTradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    ts: datetime
    symbol: str
    units: float
    price: float
    is_catchup: bool


class PaperEquityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    ts: datetime
    equity: float


class PaperSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    label: str
    source_backtest_id: uuid.UUID | None
    universe: list[str]
    timeframe: str
    starting_cash: float
    status: str
    last_processed_ts: datetime | None
    error: str | None
    created_at: datetime
    stopped_at: datetime | None


class PaperSessionDetail(PaperSessionResponse):
    spec_json: dict
    equity: list[PaperEquityOut] = []
    trades: list[PaperTradeOut] = []
