from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Protocol

from hedgefund.data.universe import DEFAULT_UNIVERSE

# Quote window: 26 hourly bars = 24h stats + cushion for a partial current bar.
QUOTE_BARS = 26
SPARKLINE_POINTS = 24
QUOTE_TTL_SECONDS = 60.0
CANDLE_TTL_SECONDS = 60.0

# Trade-view ranges → (ccxt timeframe, bar count). All ≤ 1000, so one fetch each.
RANGE_SPECS: dict[str, tuple[str, int]] = {
    "1D": ("15m", 96),
    "1W": ("1h", 168),
    "1M": ("1h", 720),
    "3M": ("1d", 90),
    "1Y": ("1d", 365),
}
_MS_PER_BAR = {"15m": 900_000, "1h": 3_600_000, "1d": 86_400_000}

COIN_NAMES: dict[str, str] = {
    "BTC": "Bitcoin", "ETH": "Ethereum", "BNB": "BNB", "XRP": "XRP",
    "ADA": "Cardano", "SOL": "Solana", "DOGE": "Dogecoin", "DOT": "Polkadot",
    "LTC": "Litecoin", "BCH": "Bitcoin Cash", "LINK": "Chainlink",
    "XLM": "Stellar", "ETC": "Ethereum Classic", "TRX": "TRON", "EOS": "EOS",
    "ATOM": "Cosmos", "XMR": "Monero", "AAVE": "Aave", "AVAX": "Avalanche",
    "ALGO": "Algorand",
}


class PricesUnavailableError(RuntimeError):
    """No fresh data and no cached snapshot to fall back to."""


class UnknownSymbolError(KeyError):
    """Symbol is not part of the trading universe."""


@dataclass(frozen=True)
class AssetQuote:
    symbol: str
    name: str
    price: float
    change_24h_pct: float
    high_24h: float
    low_24h: float
    volume_24h: float
    sparkline: tuple[float, ...]


@dataclass(frozen=True)
class Candle:
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(frozen=True)
class AssetsSnapshot:
    assets: tuple[AssetQuote, ...]
    as_of: datetime
    stale: bool = False


@dataclass(frozen=True)
class CandleSeries:
    symbol: str
    range_key: str
    candles: tuple[Candle, ...]
    stale: bool = False


class MarketDataProvider(Protocol):
    def get_assets(self) -> AssetsSnapshot: ...
    def get_candles(self, symbol: str, range_key: str) -> CandleSeries: ...


def base_symbol(pair: str) -> str:
    return pair.split("/")[0]


def quote_from_rows(symbol: str, name: str, rows: list[list[float]]) -> AssetQuote:
    """Build a quote from hourly OHLCV rows [ts_ms, o, h, l, c, v] (oldest first)."""
    if not rows:
        raise ValueError(f"no candles returned for {symbol}")
    closes = [r[4] for r in rows]
    window = rows[-SPARKLINE_POINTS:]
    price = closes[-1]
    ref_idx = -(SPARKLINE_POINTS + 1) if len(closes) > SPARKLINE_POINTS else 0
    ref = closes[ref_idx]
    return AssetQuote(
        symbol=symbol,
        name=name,
        price=price,
        change_24h_pct=(price - ref) / ref if ref else 0.0,
        high_24h=max(r[2] for r in window),
        low_24h=min(r[3] for r in window),
        volume_24h=sum(r[5] for r in window),
        sparkline=tuple(closes[-SPARKLINE_POINTS:]),
    )


def candles_from_rows(rows: list[list[float]]) -> tuple[Candle, ...]:
    return tuple(
        Candle(
            ts=datetime.fromtimestamp(r[0] / 1000, tz=timezone.utc),
            open=r[1], high=r[2], low=r[3], close=r[4], volume=r[5],
        )
        for r in rows
    )


class MarketDataCache:
    """TTL cache over ccxt for quotes and candle series.

    Snapshots are atomic: one failing symbol fails the whole refresh and the
    previous snapshot is served with stale=True. The exchange is called
    directly (no fetch.py retry/backoff) so failures surface within one call
    and API latency stays bounded — the stale fallback is the retry policy.
    """

    def __init__(
        self,
        exchange,
        universe: list[str] = DEFAULT_UNIVERSE,
        quote_ttl: float = QUOTE_TTL_SECONDS,
        candle_ttl: float = CANDLE_TTL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._exchange = exchange
        self._universe = list(universe)
        self._pairs_by_symbol = {base_symbol(p): p for p in self._universe}
        self._quote_ttl = quote_ttl
        self._candle_ttl = candle_ttl
        self._clock = clock
        # Separate locks: assets and candles are independent caches with no
        # shared invariant, so a slow quotes refresh (up to 20 sequential
        # ccxt calls) shouldn't block unrelated, already-cached candle reads.
        self._assets_lock = threading.Lock()
        self._candles_lock = threading.Lock()
        self._assets: AssetsSnapshot | None = None
        self._assets_at = 0.0
        self._candles: dict[tuple[str, str], tuple[CandleSeries, float]] = {}

    def pair_for(self, symbol: str) -> str:
        try:
            return self._pairs_by_symbol[symbol]
        except KeyError:
            raise UnknownSymbolError(symbol) from None

    def get_assets(self) -> AssetsSnapshot:
        with self._assets_lock:
            now = self._clock()
            if self._assets is not None and now - self._assets_at < self._quote_ttl:
                return self._assets
            try:
                quotes = []
                for pair in self._universe:
                    sym = base_symbol(pair)
                    rows = self._exchange.fetch_ohlcv(
                        pair, timeframe="1h", since=None, limit=QUOTE_BARS
                    )
                    quotes.append(quote_from_rows(sym, COIN_NAMES.get(sym, sym), rows))
            except Exception as exc:  # noqa: BLE001 - any fetch error → stale fallback
                if self._assets is not None:
                    return replace(self._assets, stale=True)
                raise PricesUnavailableError(str(exc)) from exc
            self._assets = AssetsSnapshot(
                assets=tuple(quotes), as_of=datetime.now(timezone.utc), stale=False
            )
            self._assets_at = now
            return self._assets

    def get_candles(self, symbol: str, range_key: str) -> CandleSeries:
        pair = self.pair_for(symbol)
        timeframe, bars = RANGE_SPECS[range_key]
        key = (symbol, range_key)
        with self._candles_lock:
            now = self._clock()
            cached = self._candles.get(key)
            if cached is not None and now - cached[1] < self._candle_ttl:
                return cached[0]
            since_ms = int(time.time() * 1000) - bars * _MS_PER_BAR[timeframe]
            try:
                rows = self._exchange.fetch_ohlcv(
                    pair, timeframe=timeframe, since=since_ms, limit=bars
                )
            except Exception as exc:  # noqa: BLE001 - any fetch error → stale fallback
                if cached is not None:
                    return replace(cached[0], stale=True)
                raise PricesUnavailableError(str(exc)) from exc
            series = CandleSeries(
                symbol=symbol, range_key=range_key, candles=candles_from_rows(rows)
            )
            self._candles[key] = (series, now)
            return series
