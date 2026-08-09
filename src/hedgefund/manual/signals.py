from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

import pandas as pd

from hedgefund.dsl.spec import RsiIndicator, SmaIndicator
from hedgefund.engine.indicators import compute_indicator
from hedgefund.manual.market_data import Candle

# Preset periods. The spec fixes the advisor's starting signal set to SMA
# cross, momentum, and RSI zones — there is deliberately no indicator picker.
SHORT_SMA = 5
LONG_SMA = 20
RSI_PERIOD = 14
MOMENTUM_LOOKBACK = 24

RSI_OVERBOUGHT = 70.0
RSI_OVERSOLD = 30.0

SmaCross = Literal["golden", "death", "none"]
RsiZone = Literal["overbought", "oversold", "neutral"]


@dataclass(frozen=True)
class CoinSignal:
    symbol: str
    price: float
    sma_short: float | None
    sma_long: float | None
    sma_cross: SmaCross
    rsi: float | None
    rsi_zone: RsiZone
    momentum_pct: float | None


@dataclass(frozen=True)
class PortfolioContext:
    equity: float
    cash: float
    idle_cash_pct: float
    top_symbol: str | None
    top_concentration_pct: float
    holdings_count: int
    total_return_pct: float


def _last_finite(frame: pd.DataFrame) -> float | None:
    """Final value of a one-column indicator frame, or None if it never warmed
    up (rolling windows emit NaN until they have enough bars)."""
    value = frame.iloc[-1, 0]
    return None if value is None or math.isnan(value) else float(value)


def coin_signal(
    symbol: str,
    candles: Sequence[Candle],
    *,
    short_period: int = SHORT_SMA,
    long_period: int = LONG_SMA,
    rsi_period: int = RSI_PERIOD,
    momentum_lookback: int = MOMENTUM_LOOKBACK,
) -> CoinSignal:
    """Reduce a candle series to the handful of facts the advisor reasons over.

    Indicator math is delegated to hedgefund.engine.indicators so there is
    exactly one RSI/SMA implementation in the codebase.
    """
    if not candles:
        raise ValueError(f"no candles for {symbol}")

    close = pd.DataFrame(
        {symbol: [c.close for c in candles]},
        index=[c.ts for c in candles],
    )

    sma_short = _last_finite(
        compute_indicator(SmaIndicator(type="sma", id="s", period=short_period), close)
    )
    sma_long = _last_finite(
        compute_indicator(SmaIndicator(type="sma", id="l", period=long_period), close)
    )
    rsi = _last_finite(
        compute_indicator(RsiIndicator(type="rsi", id="r", period=rsi_period), close)
    )

    cross: SmaCross = "none"
    if sma_short is not None and sma_long is not None:
        cross = "golden" if sma_short > sma_long else "death"

    zone: RsiZone = "neutral"
    if rsi is not None:
        if rsi >= RSI_OVERBOUGHT:
            zone = "overbought"
        elif rsi <= RSI_OVERSOLD:
            zone = "oversold"

    momentum: float | None = None
    if len(candles) > momentum_lookback:
        past = candles[-(momentum_lookback + 1)].close
        if past:
            momentum = (candles[-1].close - past) / past

    return CoinSignal(
        symbol=symbol,
        price=candles[-1].close,
        sma_short=sma_short,
        sma_long=sma_long,
        sma_cross=cross,
        rsi=rsi,
        rsi_zone=zone,
        momentum_pct=momentum,
    )


def portfolio_context(
    *,
    equity: float,
    cash: float,
    total_return_pct: float,
    positions: Sequence[tuple[str, float]],
) -> PortfolioContext:
    """Portfolio-level facts. `positions` is (symbol, market_value) pairs."""
    top_symbol: str | None = None
    top_value = 0.0
    for symbol, value in positions:
        if value > top_value:
            top_symbol, top_value = symbol, value

    safe_equity = equity if equity > 0 else 0.0
    return PortfolioContext(
        equity=equity,
        cash=cash,
        idle_cash_pct=(cash / equity) if safe_equity else 0.0,
        top_symbol=top_symbol,
        top_concentration_pct=(top_value / equity) if safe_equity else 0.0,
        holdings_count=len(positions),
        total_return_pct=total_return_pct,
    )
