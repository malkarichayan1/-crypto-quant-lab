from __future__ import annotations

from datetime import date
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class MomentumIndicator(BaseModel):
    type: Literal["momentum"]
    id: str
    lookback: int = Field(gt=0)


class SmaIndicator(BaseModel):
    type: Literal["sma"]
    id: str
    period: int = Field(gt=0)


class RsiIndicator(BaseModel):
    type: Literal["rsi"]
    id: str
    period: int = Field(gt=0)


class VolatilityIndicator(BaseModel):
    type: Literal["volatility"]
    id: str
    lookback: int = Field(gt=0)


class ZscoreIndicator(BaseModel):
    type: Literal["zscore"]
    id: str
    source_id: str
    lookback: int = Field(gt=0)


Indicator = Annotated[
    Union[
        MomentumIndicator,
        SmaIndicator,
        RsiIndicator,
        VolatilityIndicator,
        ZscoreIndicator,
    ],
    Field(discriminator="type"),
]


class Condition(BaseModel):
    indicator_id: str
    op: Literal["<", ">", "<=", ">="]
    value: float


class CrossSectionalSelection(BaseModel):
    mode: Literal["cross_sectional"]
    rank_by: str
    long_top: int = Field(ge=0)
    short_bottom: int = Field(ge=0)


class TimeSeriesSelection(BaseModel):
    mode: Literal["time_series"]
    entry: Condition
    exit: Condition


Selection = Annotated[
    Union[CrossSectionalSelection, TimeSeriesSelection],
    Field(discriminator="mode"),
]


class Sizing(BaseModel):
    scheme: Literal["equal_weight", "inverse_vol", "fixed_fraction"]
    gross_leverage: float = Field(default=1.0, gt=0)
    fraction: float = Field(default=0.1, gt=0)
    vol_indicator_id: str | None = None


class Costs(BaseModel):
    fee_bps: float = Field(default=10.0, ge=0)
    slippage_bps: float = Field(default=5.0, ge=0)


class StrategySpec(BaseModel):
    name: str
    universe: list[str] | Literal["all"]
    indicators: list[Indicator]
    selection: Selection
    sizing: Sizing = Sizing(scheme="equal_weight")
    rebalance: Literal["daily", "weekly"] = "daily"
    costs: Costs = Costs()
    start: date
    end: date
