from __future__ import annotations

from datetime import datetime, timedelta, timezone

from hedgefund.manual.market_data import (
    AssetQuote,
    AssetsSnapshot,
    Candle,
    CandleSeries,
    PricesUnavailableError,
    UnknownSymbolError,
)


def make_quote(symbol: str, name: str, price: float, change: float = 0.05) -> AssetQuote:
    # sparkline runs from ~95% of price up to price; [0] is the 24h-ago price
    spark = tuple(price * (0.95 + 0.05 * i / 23) for i in range(24))
    return AssetQuote(
        symbol=symbol, name=name, price=price, change_24h_pct=change,
        high_24h=price * 1.1, low_24h=price * 0.9, volume_24h=1_000.0,
        sparkline=spark,
    )


class FakeMarketData:
    """Deterministic MarketDataProvider for route and service tests."""

    def __init__(self, quotes: list[AssetQuote] | None = None) -> None:
        self.quotes = quotes or [
            make_quote("BTC", "Bitcoin", 100.0),
            make_quote("ETH", "Ethereum", 10.0),
        ]
        self.stale = False
        self.unavailable = False

    def pair_for(self, symbol: str) -> str:
        if symbol not in {q.symbol for q in self.quotes}:
            raise UnknownSymbolError(symbol)
        return f"{symbol}/USDT"

    def get_assets(self) -> AssetsSnapshot:
        if self.unavailable:
            raise PricesUnavailableError("market down")
        return AssetsSnapshot(
            assets=tuple(self.quotes),
            as_of=datetime(2026, 7, 30, 12, 0, tzinfo=timezone.utc),
            stale=self.stale,
        )

    def get_candles(self, symbol: str, range_key: str) -> CandleSeries:
        if self.unavailable:
            raise PricesUnavailableError("market down")
        if symbol not in {q.symbol for q in self.quotes}:
            raise UnknownSymbolError(symbol)
        base = datetime(2026, 7, 29, tzinfo=timezone.utc)
        candles = tuple(
            Candle(ts=base + timedelta(hours=i),
                   open=100.0 + i, high=101.0 + i, low=99.0 + i,
                   close=100.5 + i, volume=10.0)
            for i in range(30)
        )
        return CandleSeries(symbol=symbol, range_key=range_key,
                            candles=candles, stale=self.stale)
