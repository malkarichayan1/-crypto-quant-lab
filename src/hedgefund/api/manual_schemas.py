from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AssetQuoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    symbol: str
    name: str
    price: float
    change_24h_pct: float
    high_24h: float
    low_24h: float
    volume_24h: float
    sparkline: list[float]


class MarketAssetsResponse(BaseModel):
    assets: list[AssetQuoteOut]
    stale: bool
    as_of: datetime


class CandleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class CandlesResponse(BaseModel):
    symbol: str
    range: str
    candles: list[CandleOut]
    stale: bool


class WatchlistResponse(BaseModel):
    symbols: list[str]


class PositionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    symbol: str
    units: float
    avg_cost: float
    price: float
    market_value: float
    unrealized_pl: float
    unrealized_pl_pct: float
    change_24h_pl: float


class PortfolioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    portfolio_id: uuid.UUID
    starting_cash: float
    cash: float
    positions: list[PositionOut]
    equity: float
    today_pl: float
    total_return_pct: float
    stale: bool
    created_at: datetime


class ManualOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    symbol: str
    side: str
    usd_amount: float
    units: float
    fill_price: float
    created_at: datetime


class PlaceOrderRequest(BaseModel):
    symbol: str
    side: Literal["buy", "sell"]
    usd_amount: float = Field(gt=0)


class ResetPortfolioRequest(BaseModel):
    starting_cash: float = Field(default=100_000.0, gt=0)


class PortfolioCreatedResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    starting_cash: float
    created_at: datetime


class EquityPointOut(BaseModel):
    ts: datetime
    equity: float


class EquitySeriesResponse(BaseModel):
    range: str
    points: list[EquityPointOut]


class SuggestionActionOut(BaseModel):
    side: Literal["buy", "sell"]
    symbol: str
    usd_amount: float


class SuggestionOut(BaseModel):
    text: str
    why: str
    action: SuggestionActionOut | None = None


class AdvicePayloadOut(BaseModel):
    suggestions: list[SuggestionOut]
    disclaimer: str
    source: Literal["llm", "template"]


class AdviceResponse(BaseModel):
    enabled: bool
    advice: AdvicePayloadOut | None


class NewsItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str
    source: str
    url: str
    published_at: datetime | None


class NewsResponse(BaseModel):
    items: list[NewsItemOut]
    stale: bool
    fetched_at: datetime


class LeaderboardRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    label: str
    kind: Literal["you", "ai", "benchmark"]
    start_date: datetime
    total_return_pct: float
    equity: float
    sparkline: list[float]


class LeaderboardResponse(BaseModel):
    rows: list[LeaderboardRowOut]
    stale: bool
