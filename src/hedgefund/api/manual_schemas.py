from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
