# Beginner Frontend Redesign — Phase 2: Markets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Markets experience — market-data endpoints with a TTL cache + stale fallback, a Robinhood-style Markets page with search and a pinned watchlist, and a read-only Trade view (`/coins/:symbol`) with a lightweight-charts line chart and a Pro toggle (candles + volume + SMA-20 + RSI). Trading itself is Phase 3.

**Architecture:** New backend package `src/hedgefund/manual/` starts with `market_data.py`: an in-process `MarketDataCache` that fetches 1h OHLCV per universe coin via the injected ccxt exchange, serves quote snapshots (price, 24h change, sparkline) and per-range candle series, each behind a short TTL. On fetch failure it re-serves the last snapshot with `stale: true` (the cache + stale fallback replaces the retry/backoff in `data/fetch.py` — routes must answer fast, so the cache calls `exchange.fetch_ohlcv` directly). A `watchlist` table (migration 0004) backs star/unstar. The frontend adds `api/market.ts` + `api/watchlist.ts`, a `useWatchlist` hook, MarketsPage, AssetPage, and a `PriceChart` wrapper that isolates lightweight-charts (canvas) so jsdom tests mock the module. TanStack Query polls every 30s — no websockets.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (existing), ccxt via injected exchange (existing pattern), pytest with real Postgres test DB (existing `tests/api/conftest.py`). React 18 + TS + Tailwind v4 + shadcn/ui (Phase 1), TanStack Query, recharts (sparklines), **lightweight-charts v5** (new dep), Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-07-30-beginner-frontend-redesign-design.md` (rollout Phase 2). Phase 1 (shell) is complete on `feature/beginner-frontend-redesign`.

**Working directories:** backend commands from repo root (venv active); frontend commands from `dashboard/`. Git commands from repo root.

**API symbol convention:** the API and frontend use *base* symbols (`BTC`), mapped internally to ccxt pairs (`BTC/USDT`). This keeps `/market/assets/BTC/candles` and `/coins/BTC` slash-free.

**Spec deltas locked in by this plan:** `GET /watchlist` is added (spec table lists only PUT/DELETE, but the UI must read the list). The Trade-view stats item "You own" and the order ticket arrive in Phase 3; the ticket area renders a designed placeholder card.

---

## File map

| Action | Path | Responsibility |
|---|---|---|
| Create | `migrations/versions/0004_add_watchlist.py` | `watchlist` table |
| Create | `src/hedgefund/api/db/manual_models.py` | `WatchlistRow` |
| Create | `src/hedgefund/api/db/manual_repository.py` | watchlist star/unstar/list |
| Create | `src/hedgefund/manual/__init__.py`, `market_data.py` | quotes/candles cache + dataclasses |
| Create | `src/hedgefund/api/manual_schemas.py` | pydantic models for market + watchlist |
| Create | `src/hedgefund/api/routes/market.py`, `routes/watchlist.py` | `/market/*`, `/watchlist/*` |
| Modify | `src/hedgefund/api/deps.py` | `get_market_data` singleton dependency |
| Modify | `src/hedgefund/api/app.py` | mount new routers |
| Create | `tests/fixtures/market.py` | `FakeMarketData` for route tests |
| Modify | `tests/api/conftest.py` | override `get_market_data` |
| Create | `tests/manual/…`, `tests/api/test_market_routes.py`, `tests/api/test_watchlist_routes.py`, `tests/api/test_manual_repository.py` | backend tests |
| Modify | `dashboard/src/types.ts` | market/watchlist types |
| Create | `dashboard/src/api/market.ts` (+test), `api/watchlist.ts` | API modules |
| Modify | `dashboard/src/lib/format.ts` (+test) | `formatUsd` |
| Create | `dashboard/src/hooks/useWatchlist.ts` (+test) | shared star state |
| Create | `dashboard/src/components/CoinIcon.tsx`, `Sparkline.tsx`, `StalePricesBanner.tsx`, `AssetRow.tsx` (+tests) | Markets building blocks |
| Create | `dashboard/src/lib/indicators.ts` (+test) | client SMA/RSI for Pro view |
| Create | `dashboard/src/components/PriceChart.tsx` (+test) | lightweight-charts wrapper |
| Create | `dashboard/src/pages/MarketsPage.tsx` (+test), `pages/AssetPage.tsx` (+test) | pages |
| Modify | `dashboard/src/layout/TopBar.tsx` (+test), `layout/AppShell.test.tsx` | live coin search |
| Modify | `dashboard/src/App.tsx` (+test) | mount MarketsPage + `/coins/:symbol` |

---

### Task 1: Watchlist table, model, repository (migration 0004)

**Files:**
- Create: `migrations/versions/0004_add_watchlist.py`
- Create: `src/hedgefund/api/db/manual_models.py`
- Create: `src/hedgefund/api/db/manual_repository.py`
- Test: `tests/api/test_manual_repository.py`

- [ ] **Step 1: Write the failing repository test**

Create `tests/api/test_manual_repository.py`:

```python
from __future__ import annotations

from hedgefund.api.db.manual_repository import ManualRepository


def test_watchlist_star_list_unstar(session):
    repo = ManualRepository(session)
    assert repo.list_watchlist() == []

    repo.star("BTC")
    repo.star("ETH")
    assert repo.list_watchlist() == ["BTC", "ETH"]

    repo.star("BTC")  # idempotent
    assert repo.list_watchlist() == ["BTC", "ETH"]

    repo.unstar("BTC")
    assert repo.list_watchlist() == ["ETH"]

    repo.unstar("BTC")  # idempotent
    assert repo.list_watchlist() == ["ETH"]
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
python -m pytest tests/api/test_manual_repository.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'hedgefund.api.db.manual_repository'`.

- [ ] **Step 3: Create the model**

Create `src/hedgefund/api/db/manual_models.py`:

```python
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from hedgefund.api.db.models import Base


class WatchlistRow(Base):
    __tablename__ = "watchlist"

    symbol: Mapped[str] = mapped_column(String, primary_key=True)
    starred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 4: Create the repository**

Create `src/hedgefund/api/db/manual_repository.py`:

```python
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from hedgefund.api.db.manual_models import WatchlistRow


class ManualRepository:
    """Data access for the beginner (manual-trading) surfaces. Caller commits."""

    def __init__(self, session: Session) -> None:
        self._s = session

    def list_watchlist(self) -> list[str]:
        stmt = select(WatchlistRow).order_by(WatchlistRow.starred_at, WatchlistRow.symbol)
        return [row.symbol for row in self._s.scalars(stmt)]

    def star(self, symbol: str) -> None:
        if self._s.get(WatchlistRow, symbol) is None:
            self._s.add(WatchlistRow(symbol=symbol))
            self._s.flush()

    def unstar(self, symbol: str) -> None:
        row = self._s.get(WatchlistRow, symbol)
        if row is not None:
            self._s.delete(row)
            self._s.flush()
```

Note: `Base.metadata.create_all` in the test fixture only sees models that are imported — importing `manual_repository` imports `manual_models`, so the table is registered.

- [ ] **Step 5: Create migration 0004**

Create `migrations/versions/0004_add_watchlist.py`:

```python
"""add watchlist table

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "watchlist",
        sa.Column("symbol", sa.String(), primary_key=True),
        sa.Column("starred_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("watchlist")
```

- [ ] **Step 6: Apply the migration and run the test**

```powershell
alembic upgrade head
python -m pytest tests/api/test_manual_repository.py -v
```

Expected: migration applies cleanly; test PASSES. (The test DB is created by `Base.metadata.create_all`, so the test passes even before `alembic upgrade`; the upgrade is for the dev DB.)

- [ ] **Step 7: Commit**

```powershell
git add migrations src/hedgefund/api/db tests/api/test_manual_repository.py
git commit -m "feat(api): add watchlist table, model, and manual repository"
```

---

### Task 2: Market data service — quotes + candles cache with stale fallback

**Files:**
- Create: `src/hedgefund/manual/__init__.py`
- Create: `src/hedgefund/manual/market_data.py`
- Test: `tests/manual/__init__.py`, `tests/manual/test_market_data.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/manual/__init__.py` (empty) and `tests/manual/test_market_data.py`:

```python
from __future__ import annotations

import pytest

from hedgefund.manual.market_data import (
    MarketDataCache,
    PricesUnavailableError,
    UnknownSymbolError,
    quote_from_rows,
)


def make_rows(n: int, start_close: float = 100.0) -> list[list[float]]:
    """n hourly OHLCV rows with close increasing by 1 per bar."""
    rows = []
    for i in range(n):
        close = start_close + i
        rows.append([i * 3_600_000, close - 0.5, close + 1.0, close - 1.0, close, 10.0])
    return rows


class FakeExchange:
    def __init__(self) -> None:
        self.fail = False
        self.calls = 0

    def fetch_ohlcv(self, symbol, timeframe="1h", since=None, limit=1000):
        self.calls += 1
        if self.fail:
            raise RuntimeError("network down")
        return make_rows(min(limit, 400))


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def cache():
    exchange = FakeExchange()
    clock = FakeClock()
    c = MarketDataCache(
        exchange=exchange, universe=["BTC/USDT", "ETH/USDT"], clock=clock
    )
    return c, exchange, clock


def test_quote_from_rows_math():
    q = quote_from_rows("BTC", "Bitcoin", make_rows(26))
    assert q.price == 125.0                      # last close
    # 24h reference = close 24 bars before the last (index -25 → close 101)
    assert q.change_24h_pct == pytest.approx((125.0 - 101.0) / 101.0)
    assert q.high_24h == 126.0                   # max high of last 24 bars
    assert q.low_24h == 101.0                    # min low of last 24 bars
    assert q.volume_24h == pytest.approx(240.0)  # 24 bars * 10
    assert len(q.sparkline) == 24
    assert q.sparkline[-1] == 125.0


def test_get_assets_caches_within_ttl(cache):
    c, exchange, clock = cache
    snap1 = c.get_assets()
    assert {a.symbol for a in snap1.assets} == {"BTC", "ETH"}
    assert snap1.stale is False
    calls = exchange.calls
    clock.now += 30  # inside 60s TTL
    c.get_assets()
    assert exchange.calls == calls  # served from cache


def test_get_assets_refreshes_after_ttl(cache):
    c, exchange, clock = cache
    c.get_assets()
    calls = exchange.calls
    clock.now += 61
    c.get_assets()
    assert exchange.calls > calls


def test_get_assets_stale_fallback_on_failure(cache):
    c, exchange, clock = cache
    c.get_assets()
    clock.now += 61
    exchange.fail = True
    snap = c.get_assets()
    assert snap.stale is True
    assert {a.symbol for a in snap.assets} == {"BTC", "ETH"}


def test_get_assets_unavailable_with_cold_cache(cache):
    c, exchange, _ = cache
    exchange.fail = True
    with pytest.raises(PricesUnavailableError):
        c.get_assets()


def test_get_candles_returns_series_and_caches(cache):
    c, exchange, clock = cache
    series = c.get_candles("BTC", "1D")
    assert series.symbol == "BTC"
    assert series.range_key == "1D"
    assert len(series.candles) > 0
    assert series.candles[0].close < series.candles[-1].close
    calls = exchange.calls
    c.get_candles("BTC", "1D")
    assert exchange.calls == calls  # cached


def test_get_candles_unknown_symbol(cache):
    c, _, _ = cache
    with pytest.raises(UnknownSymbolError):
        c.get_candles("ZZZ", "1D")


def test_get_candles_stale_fallback(cache):
    c, exchange, clock = cache
    c.get_candles("BTC", "1W")
    clock.now += 61
    exchange.fail = True
    series = c.get_candles("BTC", "1W")
    assert series.stale is True
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
python -m pytest tests/manual/test_market_data.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'hedgefund.manual'`.

- [ ] **Step 3: Implement the service**

Create `src/hedgefund/manual/__init__.py` (empty) and `src/hedgefund/manual/market_data.py`:

```python
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
        self._lock = threading.Lock()
        self._assets: AssetsSnapshot | None = None
        self._assets_at = 0.0
        self._candles: dict[tuple[str, str], tuple[CandleSeries, float]] = {}

    def pair_for(self, symbol: str) -> str:
        try:
            return self._pairs_by_symbol[symbol]
        except KeyError:
            raise UnknownSymbolError(symbol) from None

    def get_assets(self) -> AssetsSnapshot:
        with self._lock:
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
        with self._lock:
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
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
python -m pytest tests/manual/test_market_data.py -v
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/hedgefund/manual tests/manual
git commit -m "feat(manual): add market data cache with quotes, candles, and stale fallback"
```

---

### Task 3: Market + watchlist schemas, routes, dependency, app wiring

**Files:**
- Create: `src/hedgefund/api/manual_schemas.py`
- Create: `src/hedgefund/api/routes/market.py`
- Create: `src/hedgefund/api/routes/watchlist.py`
- Modify: `src/hedgefund/api/deps.py`
- Modify: `src/hedgefund/api/app.py`
- Create: `tests/fixtures/market.py`
- Modify: `tests/api/conftest.py`
- Test: `tests/api/test_market_routes.py`, `tests/api/test_watchlist_routes.py`

- [ ] **Step 1: Create the fake provider fixture**

Create `tests/fixtures/market.py`:

```python
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
```

- [ ] **Step 2: Write the failing route tests**

Create `tests/api/test_market_routes.py`:

```python
from __future__ import annotations


def test_list_assets(client):
    res = client.get("/market/assets")
    assert res.status_code == 200
    body = res.json()
    assert body["stale"] is False
    symbols = [a["symbol"] for a in body["assets"]]
    assert symbols == ["BTC", "ETH"]
    btc = body["assets"][0]
    assert btc["name"] == "Bitcoin"
    assert btc["price"] == 100.0
    assert len(btc["sparkline"]) == 24


def test_list_assets_stale_flag(client, market_data):
    market_data.stale = True
    res = client.get("/market/assets")
    assert res.status_code == 200
    assert res.json()["stale"] is True


def test_list_assets_unavailable(client, market_data):
    market_data.unavailable = True
    res = client.get("/market/assets")
    assert res.status_code == 503


def test_get_candles(client):
    res = client.get("/market/assets/BTC/candles?range=1D")
    assert res.status_code == 200
    body = res.json()
    assert body["symbol"] == "BTC"
    assert body["range"] == "1D"
    assert len(body["candles"]) == 30
    first = body["candles"][0]
    assert set(first) == {"ts", "open", "high", "low", "close", "volume"}


def test_get_candles_unknown_symbol(client):
    res = client.get("/market/assets/ZZZ/candles?range=1D")
    assert res.status_code == 404


def test_get_candles_bad_range(client):
    res = client.get("/market/assets/BTC/candles?range=5Y")
    assert res.status_code == 422
```

Create `tests/api/test_watchlist_routes.py`:

```python
from __future__ import annotations


def test_watchlist_flow(client):
    assert client.get("/watchlist").json() == {"symbols": []}

    res = client.put("/watchlist/BTC")
    assert res.status_code == 200
    assert res.json() == {"symbols": ["BTC"]}

    client.put("/watchlist/ETH")
    assert client.get("/watchlist").json() == {"symbols": ["BTC", "ETH"]}

    res = client.delete("/watchlist/BTC")
    assert res.json() == {"symbols": ["ETH"]}


def test_star_lowercase_symbol_is_normalized(client):
    res = client.put("/watchlist/btc")
    assert res.json() == {"symbols": ["BTC"]}


def test_star_unknown_symbol_rejected(client):
    res = client.put("/watchlist/ZZZ")
    assert res.status_code == 422
```

- [ ] **Step 3: Run tests to verify they fail**

```powershell
python -m pytest tests/api/test_market_routes.py tests/api/test_watchlist_routes.py -v
```

Expected: FAIL — 404s (routes not mounted) and missing `market_data` fixture.

- [ ] **Step 4: Create the schemas**

Create `src/hedgefund/api/manual_schemas.py`:

```python
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
```

- [ ] **Step 5: Add the dependency**

In `src/hedgefund/api/deps.py`, add at the end (keep existing content):

```python
_market_data = None


def get_market_data():
    """Singleton MarketDataCache over a real ccxt binance instance.

    Overridden in tests via app.dependency_overrides.
    """
    global _market_data
    if _market_data is None:
        import ccxt  # local import: only needed when serving live market data

        from hedgefund.manual.market_data import MarketDataCache

        _market_data = MarketDataCache(exchange=ccxt.binance())
    return _market_data
```

- [ ] **Step 6: Create the routes**

Create `src/hedgefund/api/routes/market.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from hedgefund.api.deps import get_market_data
from hedgefund.api.manual_schemas import (
    AssetQuoteOut,
    CandleOut,
    CandlesResponse,
    MarketAssetsResponse,
)
from hedgefund.manual.market_data import (
    RANGE_SPECS,
    PricesUnavailableError,
    UnknownSymbolError,
)

router = APIRouter(prefix="/market", tags=["market"])

_UNAVAILABLE_MSG = "Prices are temporarily unavailable — please try again shortly."


@router.get("/assets", response_model=MarketAssetsResponse)
def list_assets(market=Depends(get_market_data)) -> MarketAssetsResponse:
    try:
        snap = market.get_assets()
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    return MarketAssetsResponse(
        assets=[AssetQuoteOut.model_validate(a) for a in snap.assets],
        stale=snap.stale,
        as_of=snap.as_of,
    )


@router.get("/assets/{symbol}/candles", response_model=CandlesResponse)
def get_candles(
    symbol: str,
    range: str = Query("1D"),
    market=Depends(get_market_data),
) -> CandlesResponse:
    if range not in RANGE_SPECS:
        raise HTTPException(
            status_code=422, detail=f"range must be one of {sorted(RANGE_SPECS)}"
        )
    try:
        series = market.get_candles(symbol.upper(), range)
    except UnknownSymbolError:
        raise HTTPException(status_code=404, detail="Unknown coin.")
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    return CandlesResponse(
        symbol=series.symbol,
        range=series.range_key,
        candles=[CandleOut.model_validate(c) for c in series.candles],
        stale=series.stale,
    )
```

Create `src/hedgefund/api/routes/watchlist.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from hedgefund.api.db.engine import get_session
from hedgefund.api.db.manual_repository import ManualRepository
from hedgefund.api.manual_schemas import WatchlistResponse
from hedgefund.data.universe import DEFAULT_UNIVERSE
from hedgefund.manual.market_data import base_symbol

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

_BASE_SYMBOLS = {base_symbol(p) for p in DEFAULT_UNIVERSE}


@router.get("", response_model=WatchlistResponse)
def get_watchlist(session: Session = Depends(get_session)) -> WatchlistResponse:
    return WatchlistResponse(symbols=ManualRepository(session).list_watchlist())


@router.put("/{symbol}", response_model=WatchlistResponse)
def star(symbol: str, session: Session = Depends(get_session)) -> WatchlistResponse:
    symbol = symbol.upper()
    if symbol not in _BASE_SYMBOLS:
        raise HTTPException(status_code=422, detail="Unknown coin.")
    repo = ManualRepository(session)
    repo.star(symbol)
    session.commit()
    return WatchlistResponse(symbols=repo.list_watchlist())


@router.delete("/{symbol}", response_model=WatchlistResponse)
def unstar(symbol: str, session: Session = Depends(get_session)) -> WatchlistResponse:
    repo = ManualRepository(session)
    repo.unstar(symbol.upper())
    session.commit()
    return WatchlistResponse(symbols=repo.list_watchlist())
```

- [ ] **Step 7: Mount the routers**

In `src/hedgefund/api/app.py`, add imports next to the existing router imports:

```python
from hedgefund.api.routes.market import router as market_router
from hedgefund.api.routes.watchlist import router as watchlist_router
```

and after `app.include_router(paper_sessions_router)`:

```python
    app.include_router(market_router)
    app.include_router(watchlist_router)
```

- [ ] **Step 8: Wire the fake into the test client**

In `tests/api/conftest.py`, add a `market_data` fixture and extend the `client` fixture. Add after the `session` fixture:

```python
@pytest.fixture
def market_data():
    from tests.fixtures.market import FakeMarketData

    return FakeMarketData()
```

Change the `client` fixture signature to `def client(session, market_data):` and add one override next to the existing ones:

```python
    from hedgefund.api.deps import get_market_data

    app.dependency_overrides[get_market_data] = lambda: market_data
```

- [ ] **Step 9: Run route tests, then the full backend suite**

```powershell
python -m pytest tests/api/test_market_routes.py tests/api/test_watchlist_routes.py -v
python -m pytest
```

Expected: new tests PASS; full suite green (existing tests untouched by the conftest addition).

- [ ] **Step 10: Commit**

```powershell
git add src/hedgefund/api tests
git commit -m "feat(api): add market data and watchlist endpoints"
```

---

### Task 4: Frontend types, API modules, formatUsd

**Files:**
- Modify: `dashboard/src/types.ts`
- Create: `dashboard/src/api/market.ts`
- Test: `dashboard/src/api/market.test.ts`
- Create: `dashboard/src/api/watchlist.ts`
- Modify: `dashboard/src/lib/format.ts`
- Modify: `dashboard/src/lib/format.test.ts` (extend; create if it does not exist)

- [ ] **Step 1: Write the failing tests**

Create `dashboard/src/api/market.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAssetCandles, getMarketAssets } from './market'

function okJson(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
}

describe('market api', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches the assets list', async () => {
    const fetchMock = vi.fn(() => okJson({ assets: [], stale: false, as_of: 'x' }))
    vi.stubGlobal('fetch', fetchMock)
    await getMarketAssets()
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/market/assets', undefined)
  })

  it('fetches candles with symbol and range', async () => {
    const fetchMock = vi.fn(() => okJson({ symbol: 'BTC', range: '1W', candles: [], stale: false }))
    vi.stubGlobal('fetch', fetchMock)
    await getAssetCandles('BTC', '1W')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/market/assets/BTC/candles?range=1W',
      undefined,
    )
  })
})
```

In `dashboard/src/lib/format.test.ts`, add (create the file with the standard vitest imports if it does not exist; otherwise append the block):

```ts
import { describe, expect, it } from 'vitest'
import { formatUsd } from './format'

describe('formatUsd', () => {
  it('formats dollars with grouping and two decimals', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50')
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(-50)).toBe('-$50.00')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
cd dashboard
npx vitest run src/api/market.test.ts src/lib/format.test.ts
```

Expected: FAIL — `Cannot find module './market'` and `formatUsd` not exported.

- [ ] **Step 3: Add the types**

Append to `dashboard/src/types.ts`:

```ts
// ---- Beginner surfaces (Phase 2+) ----

export type TimeRange = '1D' | '1W' | '1M' | '3M' | '1Y'

export interface AssetQuote {
  symbol: string
  name: string
  price: number
  change_24h_pct: number
  high_24h: number
  low_24h: number
  volume_24h: number
  sparkline: number[]
}

export interface MarketAssetsResponse {
  assets: AssetQuote[]
  stale: boolean
  as_of: string
}

export interface Candle {
  ts: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface CandlesResponse {
  symbol: string
  range: TimeRange
  candles: Candle[]
  stale: boolean
}

export interface WatchlistResponse {
  symbols: string[]
}
```

- [ ] **Step 4: Implement the API modules and formatUsd**

Create `dashboard/src/api/market.ts`:

```ts
import { apiFetch } from './client'
import type { CandlesResponse, MarketAssetsResponse, TimeRange } from '../types'

export function getMarketAssets(): Promise<MarketAssetsResponse> {
  return apiFetch<MarketAssetsResponse>('/market/assets')
}

export function getAssetCandles(symbol: string, range: TimeRange): Promise<CandlesResponse> {
  return apiFetch<CandlesResponse>(`/market/assets/${symbol}/candles?range=${range}`)
}
```

Create `dashboard/src/api/watchlist.ts`:

```ts
import { apiFetch } from './client'
import type { WatchlistResponse } from '../types'

export function getWatchlist(): Promise<WatchlistResponse> {
  return apiFetch<WatchlistResponse>('/watchlist')
}

export function starSymbol(symbol: string): Promise<WatchlistResponse> {
  return apiFetch<WatchlistResponse>(`/watchlist/${symbol}`, { method: 'PUT' })
}

export function unstarSymbol(symbol: string): Promise<WatchlistResponse> {
  return apiFetch<WatchlistResponse>(`/watchlist/${symbol}`, { method: 'DELETE' })
}
```

Append to `dashboard/src/lib/format.ts`:

```ts
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export function formatUsd(value: number): string {
  return usdFormatter.format(value)
}
```

- [ ] **Step 5: Run tests to verify they pass**

```powershell
npx vitest run src/api/market.test.ts src/lib/format.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
cd ..
git add dashboard/src
git commit -m "feat(dashboard): add market/watchlist api modules and formatUsd"
```

---

### Task 5: useWatchlist hook

**Files:**
- Create: `dashboard/src/hooks/useWatchlist.ts`
- Test: `dashboard/src/hooks/useWatchlist.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/hooks/useWatchlist.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useWatchlist } from './useWatchlist'
import * as watchlistApi from '../api/watchlist'

vi.mock('../api/watchlist')

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useWatchlist', () => {
  beforeEach(() => {
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue({ symbols: ['BTC'] })
    vi.mocked(watchlistApi.starSymbol).mockResolvedValue({ symbols: ['BTC', 'ETH'] })
    vi.mocked(watchlistApi.unstarSymbol).mockResolvedValue({ symbols: [] })
  })

  it('exposes the starred set', async () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper })
    await waitFor(() => expect(result.current.starred.has('BTC')).toBe(true))
  })

  it('toggle stars an unstarred symbol and unstars a starred one', async () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper })
    await waitFor(() => expect(result.current.starred.has('BTC')).toBe(true))

    result.current.toggle('ETH')
    await waitFor(() => expect(watchlistApi.starSymbol).toHaveBeenCalledWith('ETH'))

    result.current.toggle('BTC')
    await waitFor(() => expect(watchlistApi.unstarSymbol).toHaveBeenCalledWith('BTC'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd dashboard
npx vitest run src/hooks/useWatchlist.test.tsx
```

Expected: FAIL — `Cannot find module './useWatchlist'`.

- [ ] **Step 3: Implement the hook**

Create `dashboard/src/hooks/useWatchlist.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getWatchlist, starSymbol, unstarSymbol } from '../api/watchlist'
import type { WatchlistResponse } from '../types'

export function useWatchlist() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['watchlist'], queryFn: getWatchlist })
  const starred = new Set(data?.symbols ?? [])

  const applyResult = (result: WatchlistResponse) =>
    queryClient.setQueryData(['watchlist'], result)

  const star = useMutation({ mutationFn: starSymbol, onSuccess: applyResult })
  const unstar = useMutation({ mutationFn: unstarSymbol, onSuccess: applyResult })

  const toggle = (symbol: string) => {
    if (starred.has(symbol)) {
      unstar.mutate(symbol)
    } else {
      star.mutate(symbol)
    }
  }

  return { starred, toggle }
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npx vitest run src/hooks/useWatchlist.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```powershell
cd ..
git add dashboard/src/hooks
git commit -m "feat(dashboard): add useWatchlist hook"
```

---

### Task 6: CoinIcon, Sparkline, StalePricesBanner, AssetRow

**Files:**
- Create: `dashboard/src/components/CoinIcon.tsx`
- Create: `dashboard/src/components/Sparkline.tsx`
- Create: `dashboard/src/components/StalePricesBanner.tsx`
- Create: `dashboard/src/components/AssetRow.tsx`
- Test: `dashboard/src/components/AssetRow.test.tsx`

CoinIcon/Sparkline/StalePricesBanner are tiny presentational pieces exercised through the AssetRow test (and page tests later) — one test file keeps the suite lean.

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/components/AssetRow.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AssetRow } from './AssetRow'
import type { AssetQuote } from '../types'

const btc: AssetQuote = {
  symbol: 'BTC',
  name: 'Bitcoin',
  price: 64231.5,
  change_24h_pct: 0.0231,
  high_24h: 65000,
  low_24h: 63000,
  volume_24h: 1_000_000,
  sparkline: [63000, 63500, 64231.5],
}

function renderRow(overrides: Partial<Parameters<typeof AssetRow>[0]> = {}) {
  const onToggleStar = vi.fn()
  render(
    <MemoryRouter>
      <AssetRow asset={btc} isStarred={false} onToggleStar={onToggleStar} {...overrides} />
    </MemoryRouter>,
  )
  return { onToggleStar }
}

describe('AssetRow', () => {
  it('links to the trade view and shows name, price, and change', () => {
    renderRow()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/coins/BTC')
    expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('$64,231.50')).toBeInTheDocument()
    expect(screen.getByText('+2.31%')).toBeInTheDocument()
  })

  it('toggles the star without navigating', async () => {
    const { onToggleStar } = renderRow()
    await userEvent.click(screen.getByRole('button', { name: /add btc to watchlist/i }))
    expect(onToggleStar).toHaveBeenCalledWith('BTC')
  })

  it('labels the star for removal when starred', () => {
    renderRow({ isStarred: true })
    expect(
      screen.getByRole('button', { name: /remove btc from watchlist/i }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd dashboard
npx vitest run src/components/AssetRow.test.tsx
```

Expected: FAIL — `Cannot find module './AssetRow'`.

- [ ] **Step 3: Implement the components**

Create `dashboard/src/components/CoinIcon.tsx`:

```tsx
import { cn } from '@/lib/utils'

type Props = {
  symbol: string
  className?: string
}

// Deterministic hue per symbol so each coin gets a stable identity color.
function hueFor(symbol: string): number {
  let hash = 0
  for (const char of symbol) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360
  }
  return hash
}

export function CoinIcon({ symbol, className }: Props) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
        className,
      )}
      style={{ backgroundColor: `hsl(${hueFor(symbol)} 60% 40%)` }}
    >
      {symbol.slice(0, 3)}
    </div>
  )
}
```

Create `dashboard/src/components/Sparkline.tsx`:

```tsx
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'

type Props = {
  data: number[]
  isPositive: boolean
}

export function Sparkline({ data, isPositive }: Props) {
  const points = data.map((value, index) => ({ index, value }))
  return (
    <div className="h-8 w-24" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            dataKey="value"
            stroke={isPositive ? 'var(--color-profit)' : 'var(--color-loss)'}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

Create `dashboard/src/components/StalePricesBanner.tsx`:

```tsx
import { Clock } from 'lucide-react'

export function StalePricesBanner() {
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-lg border border-watch/30 bg-watch/10 px-3 py-2 text-sm text-watch"
    >
      <Clock className="size-4 shrink-0" aria-hidden="true" />
      Prices delayed — showing the last data we received.
    </div>
  )
}
```

Create `dashboard/src/components/AssetRow.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPct, formatUsd } from '../lib/format'
import { CoinIcon } from './CoinIcon'
import { Sparkline } from './Sparkline'
import type { AssetQuote } from '../types'

type Props = {
  asset: AssetQuote
  isStarred: boolean
  onToggleStar: (symbol: string) => void
}

export function AssetRow({ asset, isStarred, onToggleStar }: Props) {
  const isPositive = asset.change_24h_pct >= 0
  return (
    <Link
      to={`/coins/${asset.symbol}`}
      className="flex items-center gap-4 rounded-xl border border-transparent px-3 py-2.5 transition-colors duration-200 hover:border-border hover:bg-card"
    >
      <CoinIcon symbol={asset.symbol} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{asset.name}</p>
        <p className="text-xs text-muted-foreground">{asset.symbol}</p>
      </div>
      <div className="hidden sm:block">
        <Sparkline data={asset.sparkline} isPositive={isPositive} />
      </div>
      <div className="w-28 text-right">
        <p className="text-sm font-medium tabular-nums">{formatUsd(asset.price)}</p>
        <p
          className={cn(
            'text-xs tabular-nums',
            isPositive ? 'text-profit' : 'text-loss',
          )}
        >
          {formatPct(asset.change_24h_pct)}
        </p>
      </div>
      <button
        type="button"
        aria-label={
          isStarred
            ? `Remove ${asset.symbol} from watchlist`
            : `Add ${asset.symbol} to watchlist`
        }
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onToggleStar(asset.symbol)
        }}
        className="rounded-md p-1.5 transition-colors duration-200 hover:bg-accent"
      >
        <Star
          className={cn(
            'size-4',
            isStarred ? 'fill-watch text-watch' : 'text-muted-foreground',
          )}
          aria-hidden="true"
        />
      </button>
    </Link>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npx vitest run src/components/AssetRow.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```powershell
cd ..
git add dashboard/src/components
git commit -m "feat(dashboard): add coin icon, sparkline, stale banner, and asset row"
```

---

### Task 7: MarketsPage

**Files:**
- Create: `dashboard/src/pages/MarketsPage.tsx`
- Test: `dashboard/src/pages/MarketsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/pages/MarketsPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MarketsPage } from './MarketsPage'
import * as marketApi from '../api/market'
import * as watchlistApi from '../api/watchlist'
import type { AssetQuote } from '../types'

vi.mock('../api/market')
vi.mock('../api/watchlist')

function quote(symbol: string, name: string, price: number, change = 0.01): AssetQuote {
  return {
    symbol, name, price, change_24h_pct: change,
    high_24h: price, low_24h: price, volume_24h: 1,
    sparkline: [price * 0.99, price],
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MarketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MarketsPage', () => {
  beforeEach(() => {
    vi.mocked(marketApi.getMarketAssets).mockResolvedValue({
      assets: [
        quote('BTC', 'Bitcoin', 64000),
        quote('ETH', 'Ethereum', 3400),
        quote('SOL', 'Solana', 180),
      ],
      stale: false,
      as_of: '2026-07-30T12:00:00Z',
    })
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue({ symbols: [] })
  })

  it('renders a row per asset', async () => {
    renderPage()
    expect(await screen.findByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('Ethereum')).toBeInTheDocument()
    expect(screen.getByText('Solana')).toBeInTheDocument()
  })

  it('pins starred coins to the top', async () => {
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue({ symbols: ['SOL'] })
    renderPage()
    await screen.findByText('Bitcoin')
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/coins/SOL')
  })

  it('filters rows by search query', async () => {
    renderPage()
    await screen.findByText('Bitcoin')
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'sol')
    expect(screen.getByText('Solana')).toBeInTheDocument()
    expect(screen.queryByText('Bitcoin')).not.toBeInTheDocument()
  })

  it('shows the stale banner when prices are delayed', async () => {
    vi.mocked(marketApi.getMarketAssets).mockResolvedValue({
      assets: [quote('BTC', 'Bitcoin', 64000)],
      stale: true,
      as_of: '2026-07-30T12:00:00Z',
    })
    renderPage()
    expect(await screen.findByRole('status')).toHaveTextContent(/prices delayed/i)
  })

  it('shows an error state with retry when the request fails', async () => {
    vi.mocked(marketApi.getMarketAssets).mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText(/couldn't load market data/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd dashboard
npx vitest run src/pages/MarketsPage.test.tsx
```

Expected: FAIL — `Cannot find module './MarketsPage'`.

- [ ] **Step 3: Implement MarketsPage**

Create `dashboard/src/pages/MarketsPage.tsx`:

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getMarketAssets } from '../api/market'
import { useWatchlist } from '../hooks/useWatchlist'
import { AssetRow } from '../components/AssetRow'
import { StalePricesBanner } from '../components/StalePricesBanner'

const POLL_INTERVAL_MS = 30_000
const SKELETON_ROWS = 8

export function MarketsPage() {
  const [query, setQuery] = useState('')
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['market-assets'],
    queryFn: getMarketAssets,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const { starred, toggle } = useWatchlist()

  const normalized = query.trim().toLowerCase()
  const filtered = (data?.assets ?? []).filter(
    (asset) =>
      asset.symbol.toLowerCase().includes(normalized) ||
      asset.name.toLowerCase().includes(normalized),
  )
  // Stable sort: starred first, API (universe) order within each group.
  const rows = [...filtered].sort(
    (a, b) => Number(starred.has(b.symbol)) - Number(starred.has(a.symbol)),
  )

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Markets</h1>
        <div className="relative w-full max-w-xs">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Search coins…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-9"
          />
        </div>
      </div>

      {data?.stale && <StalePricesBanner />}

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            We couldn't load market data.
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="flex flex-col gap-1">
          {rows.map((asset) => (
            <AssetRow
              key={asset.symbol}
              asset={asset}
              isStarred={starred.has(asset.symbol)}
              onToggleStar={toggle}
            />
          ))}
          {rows.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No coins match "{query}".
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npx vitest run src/pages/MarketsPage.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```powershell
cd ..
git add dashboard/src/pages
git commit -m "feat(dashboard): add markets page with search and pinned watchlist"
```

---

### Task 8: Client-side indicators (SMA, RSI)

**Files:**
- Create: `dashboard/src/lib/indicators.ts`
- Test: `dashboard/src/lib/indicators.test.ts`

These mirror the backend's `engine/indicators.py` math (rolling-mean RSI) so Pro view matches the Lab's numbers.

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/lib/indicators.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rsi, sma } from './indicators'

describe('sma', () => {
  it('returns null until the window fills, then rolling means', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5])
  })

  it('handles period longer than the series', () => {
    expect(sma([1, 2], 5)).toEqual([null, null])
  })
})

describe('rsi', () => {
  it('is 100 when every move is a gain', () => {
    const result = rsi([1, 2, 3, 4, 5], 2)
    expect(result[4]).toBe(100)
  })

  it('is 0 when every move is a loss', () => {
    const result = rsi([5, 4, 3, 2, 1], 2)
    expect(result[4]).toBe(0)
  })

  it('is null before the window fills', () => {
    const result = rsi([1, 2, 3, 4, 5], 3)
    expect(result.slice(0, 3)).toEqual([null, null, null])
  })

  it('computes the classic formula for mixed moves', () => {
    // deltas: +1, -0.5 → avg gain 0.5, avg loss 0.25 → RS 2 → RSI 66.67
    const result = rsi([10, 11, 10.5], 2)
    expect(result[2]).toBeCloseTo(66.6667, 3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd dashboard
npx vitest run src/lib/indicators.test.ts
```

Expected: FAIL — `Cannot find module './indicators'`.

- [ ] **Step 3: Implement**

Create `dashboard/src/lib/indicators.ts`:

```ts
export function sma(values: number[], period: number): (number | null)[] {
  return values.map((_, index) => {
    if (index < period - 1) return null
    const window = values.slice(index - period + 1, index + 1)
    return window.reduce((sum, value) => sum + value, 0) / period
  })
}

export function rsi(values: number[], period: number): (number | null)[] {
  const deltas = values.map((value, index) =>
    index === 0 ? 0 : value - values[index - 1],
  )
  return values.map((_, index) => {
    if (index < period) return null
    const window = deltas.slice(index - period + 1, index + 1)
    const avgGain = window.reduce((sum, d) => sum + Math.max(d, 0), 0) / period
    const avgLoss = window.reduce((sum, d) => sum + Math.max(-d, 0), 0) / period
    if (avgLoss === 0 && avgGain === 0) return null
    if (avgLoss === 0) return 100
    const rs = avgGain / avgLoss
    return 100 - 100 / (1 + rs)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npx vitest run src/lib/indicators.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```powershell
cd ..
git add dashboard/src/lib
git commit -m "feat(dashboard): add client-side sma and rsi for pro view"
```

---

### Task 9: PriceChart (lightweight-charts wrapper)

**Files:**
- Create: `dashboard/src/components/PriceChart.tsx`
- Test: `dashboard/src/components/PriceChart.test.tsx`

lightweight-charts is canvas-based; the wrapper is the **only** file that imports it, and tests mock the module so jsdom never touches canvas (spec §12).

- [ ] **Step 1: Install the dependency**

```powershell
cd dashboard
npm install lightweight-charts
```

Expected: `lightweight-charts` ^5.x added. **v5 API note:** series are created with `chart.addSeries(SeriesDefinition, options, paneIndex)` — the v4 `addAreaSeries()` methods no longer exist.

- [ ] **Step 2: Write the failing test**

Create `dashboard/src/components/PriceChart.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PriceChart } from './PriceChart'
import type { Candle } from '../types'

const addSeries = vi.fn(() => ({ setData: vi.fn() }))
const chartMock = {
  addSeries,
  timeScale: () => ({ fitContent: vi.fn() }),
  remove: vi.fn(),
}

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => chartMock),
  AreaSeries: 'AreaSeries',
  CandlestickSeries: 'CandlestickSeries',
  HistogramSeries: 'HistogramSeries',
  LineSeries: 'LineSeries',
}))

function makeCandles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    ts: new Date(Date.UTC(2026, 6, 1, i)).toISOString(),
    open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 10,
  }))
}

describe('PriceChart', () => {
  beforeEach(() => addSeries.mockClear())

  it('renders one area series in line mode', () => {
    render(<PriceChart candles={makeCandles(30)} mode="line" />)
    expect(addSeries).toHaveBeenCalledTimes(1)
    expect(addSeries.mock.calls[0][0]).toBe('AreaSeries')
  })

  it('renders candles, sma, volume, and rsi series in pro mode', () => {
    render(<PriceChart candles={makeCandles(30)} mode="pro" />)
    expect(addSeries).toHaveBeenCalledTimes(4)
    const seriesTypes = addSeries.mock.calls.map((call) => call[0])
    expect(seriesTypes).toEqual([
      'CandlestickSeries',
      'LineSeries',
      'HistogramSeries',
      'LineSeries',
    ])
  })

  it('renders nothing chart-wise with no candles', () => {
    render(<PriceChart candles={[]} mode="line" />)
    expect(addSeries).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```powershell
npx vitest run src/components/PriceChart.test.tsx
```

Expected: FAIL — `Cannot find module './PriceChart'`.

- [ ] **Step 4: Implement PriceChart**

Create `dashboard/src/components/PriceChart.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import {
  AreaSeries,
  CandlestickSeries,
  createChart,
  HistogramSeries,
  LineSeries,
  type UTCTimestamp,
} from 'lightweight-charts'
import { rsi, sma } from '../lib/indicators'
import type { Candle } from '../types'

type Props = {
  candles: Candle[]
  mode: 'line' | 'pro'
}

const CHART_HEIGHT = 360
const SMA_PERIOD = 20
const RSI_PERIOD = 14

const COLORS = {
  accent: '#3b82f6',
  profit: '#22c55e',
  loss: '#ef4444',
  watch: '#f59e0b',
  muted: '#8b93a7',
  border: '#232838',
}

function toTime(ts: string): UTCTimestamp {
  return Math.floor(Date.parse(ts) / 1000) as UTCTimestamp
}

/** Pair indicator values with candle times, skipping the unfilled window. */
function indicatorData(candles: Candle[], values: (number | null)[]) {
  return candles.flatMap((candle, index) =>
    values[index] === null
      ? []
      : [{ time: toTime(candle.ts), value: values[index] as number }],
  )
}

export function PriceChart({ candles, mode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || candles.length === 0) return

    const chart = createChart(container, {
      height: CHART_HEIGHT,
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: COLORS.muted },
      grid: {
        vertLines: { color: COLORS.border },
        horzLines: { color: COLORS.border },
      },
      timeScale: { borderColor: COLORS.border, timeVisible: true },
      rightPriceScale: { borderColor: COLORS.border },
    })

    if (mode === 'line') {
      const area = chart.addSeries(AreaSeries, {
        lineColor: COLORS.accent,
        topColor: 'rgba(59, 130, 246, 0.25)',
        bottomColor: 'rgba(59, 130, 246, 0)',
        lineWidth: 2,
      })
      area.setData(candles.map((c) => ({ time: toTime(c.ts), value: c.close })))
    } else {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: COLORS.profit,
        downColor: COLORS.loss,
        wickUpColor: COLORS.profit,
        wickDownColor: COLORS.loss,
        borderVisible: false,
      })
      candleSeries.setData(
        candles.map((c) => ({
          time: toTime(c.ts), open: c.open, high: c.high, low: c.low, close: c.close,
        })),
      )

      const closes = candles.map((c) => c.close)
      const smaSeries = chart.addSeries(LineSeries, {
        color: COLORS.watch,
        lineWidth: 1,
        priceLineVisible: false,
      })
      smaSeries.setData(indicatorData(candles, sma(closes, SMA_PERIOD)))

      const volumeSeries = chart.addSeries(
        HistogramSeries,
        { color: 'rgba(139, 147, 167, 0.4)', priceFormat: { type: 'volume' } },
        1,
      )
      volumeSeries.setData(candles.map((c) => ({ time: toTime(c.ts), value: c.volume })))

      const rsiSeries = chart.addSeries(
        LineSeries,
        { color: COLORS.accent, lineWidth: 1, priceLineVisible: false },
        2,
      )
      rsiSeries.setData(indicatorData(candles, rsi(closes, RSI_PERIOD)))
    }

    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [candles, mode])

  return (
    <div
      ref={containerRef}
      data-testid="price-chart"
      className="h-[360px] w-full"
    />
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

```powershell
npx vitest run src/components/PriceChart.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```powershell
cd ..
git add dashboard/src/components dashboard/package.json dashboard/package-lock.json
git commit -m "feat(dashboard): add lightweight-charts price chart with pro mode"
```

---

### Task 10: AssetPage (read-only trade view)

**Files:**
- Create: `dashboard/src/pages/AssetPage.tsx`
- Test: `dashboard/src/pages/AssetPage.test.tsx`

Phase-2 scope: header (icon, name, star, price, change), timeframe pills, line/Pro chart, 24h stats. The order-ticket panel renders a designed "Trading opens soon" card ("You own" and the real ticket arrive in Phase 3; the Advisor card in Phase 4).

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/pages/AssetPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AssetPage } from './AssetPage'
import * as marketApi from '../api/market'
import * as watchlistApi from '../api/watchlist'

vi.mock('../api/market')
vi.mock('../api/watchlist')
vi.mock('../components/PriceChart', () => ({
  PriceChart: ({ mode }: { mode: string }) => (
    <div data-testid="price-chart">{mode}</div>
  ),
}))

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/coins/:symbol" element={<AssetPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AssetPage', () => {
  beforeEach(() => {
    vi.mocked(marketApi.getMarketAssets).mockResolvedValue({
      assets: [{
        symbol: 'BTC', name: 'Bitcoin', price: 64231.5, change_24h_pct: 0.0231,
        high_24h: 65000, low_24h: 63000, volume_24h: 1_000_000,
        sparkline: [63000, 64231.5],
      }],
      stale: false,
      as_of: '2026-07-30T12:00:00Z',
    })
    vi.mocked(marketApi.getAssetCandles).mockResolvedValue({
      symbol: 'BTC', range: '1D', stale: false,
      candles: [{ ts: '2026-07-30T00:00:00Z', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }],
    })
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue({ symbols: [] })
  })

  it('renders header, price, stats, and the phase-3 ticket placeholder', async () => {
    renderAt('/coins/BTC')
    expect(await screen.findByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('$64,231.50')).toBeInTheDocument()
    expect(screen.getByText('+2.31%', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/24h high/i)).toBeInTheDocument()
    expect(screen.getByText(/trading opens soon/i)).toBeInTheDocument()
  })

  it('defaults to line mode and switches to pro mode', async () => {
    renderAt('/coins/BTC')
    expect(await screen.findByTestId('price-chart')).toHaveTextContent('line')
    await userEvent.click(screen.getByRole('switch', { name: /pro view/i }))
    expect(screen.getByTestId('price-chart')).toHaveTextContent('pro')
  })

  it('requests candles for the selected range', async () => {
    renderAt('/coins/BTC')
    await screen.findByText('Bitcoin')
    await userEvent.click(screen.getByRole('button', { name: '1M' }))
    expect(marketApi.getAssetCandles).toHaveBeenLastCalledWith('BTC', '1M')
  })

  it('shows a not-found state for a symbol outside the universe', async () => {
    renderAt('/coins/ZZZ')
    expect(await screen.findByText(/couldn't find that coin/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to markets/i })).toHaveAttribute(
      'href',
      '/markets',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd dashboard
npx vitest run src/pages/AssetPage.test.tsx
```

Expected: FAIL — `Cannot find module './AssetPage'`.

- [ ] **Step 3: Implement AssetPage**

Create `dashboard/src/pages/AssetPage.tsx`:

```tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Lock, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { getAssetCandles, getMarketAssets } from '../api/market'
import { useWatchlist } from '../hooks/useWatchlist'
import { CoinIcon } from '../components/CoinIcon'
import { PriceChart } from '../components/PriceChart'
import { StalePricesBanner } from '../components/StalePricesBanner'
import { formatPct, formatUsd } from '../lib/format'
import type { TimeRange } from '../types'

const RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', '1Y']
const POLL_INTERVAL_MS = 30_000

export function AssetPage() {
  const { symbol: rawSymbol } = useParams()
  const symbol = (rawSymbol ?? '').toUpperCase()
  const [range, setRange] = useState<TimeRange>('1D')
  const [isProView, setIsProView] = useState(false)
  const { starred, toggle } = useWatchlist()

  const assetsQuery = useQuery({
    queryKey: ['market-assets'],
    queryFn: getMarketAssets,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const candlesQuery = useQuery({
    queryKey: ['asset-candles', symbol, range],
    queryFn: () => getAssetCandles(symbol, range),
    enabled: symbol.length > 0,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const quote = assetsQuery.data?.assets.find((a) => a.symbol === symbol)

  if (assetsQuery.isSuccess && !quote) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-muted-foreground">
          We couldn't find that coin.
        </p>
        <Button asChild variant="outline">
          <Link to="/markets">Back to Markets</Link>
        </Button>
      </div>
    )
  }

  const isPositive = (quote?.change_24h_pct ?? 0) >= 0
  const isStarred = starred.has(symbol)

  return (
    <div>
      {(assetsQuery.data?.stale || candlesQuery.data?.stale) && <StalePricesBanner />}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CoinIcon symbol={symbol} className="size-11" />
          <div>
            {quote ? (
              <p className="text-lg font-semibold">{quote.name}</p>
            ) : (
              <Skeleton className="h-6 w-28" />
            )}
            <p className="text-xs text-muted-foreground">{symbol}</p>
          </div>
          <button
            type="button"
            aria-label={
              isStarred
                ? `Remove ${symbol} from watchlist`
                : `Add ${symbol} to watchlist`
            }
            onClick={() => toggle(symbol)}
            className="rounded-md p-1.5 transition-colors duration-200 hover:bg-accent"
          >
            <Star
              className={cn(
                'size-5',
                isStarred ? 'fill-watch text-watch' : 'text-muted-foreground',
              )}
              aria-hidden="true"
            />
          </button>
        </div>
        <div className="text-right">
          {quote ? (
            <>
              <p className="text-3xl font-bold tabular-nums">{formatUsd(quote.price)}</p>
              <p
                className={cn(
                  'text-sm tabular-nums',
                  isPositive ? 'text-profit' : 'text-loss',
                )}
              >
                {formatPct(quote.change_24h_pct)} today
              </p>
            </>
          ) : (
            <Skeleton className="h-10 w-40" />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200',
                    range === r
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Pro view
              <Switch
                aria-label="Pro view"
                checked={isProView}
                onCheckedChange={setIsProView}
              />
            </label>
          </div>

          {candlesQuery.isLoading ? (
            <Skeleton className="h-[360px] w-full rounded-xl" />
          ) : (
            <PriceChart
              candles={candlesQuery.data?.candles ?? []}
              mode={isProView ? 'pro' : 'line'}
            />
          )}

          <div className="mt-4 grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">24h high</p>
                <p className="mt-1 text-sm font-medium tabular-nums">
                  {quote ? formatUsd(quote.high_24h) : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">24h low</p>
                <p className="mt-1 text-sm font-medium tabular-nums">
                  {quote ? formatUsd(quote.low_24h) : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">24h volume</p>
                <p className="mt-1 text-sm font-medium tabular-nums">
                  {quote ? formatUsd(quote.volume_24h) : '—'}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="h-fit">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-secondary">
              <Lock className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium">Trading opens soon</p>
            <p className="text-xs text-muted-foreground">
              Buying and selling with your practice portfolio arrives in the next
              update. Until then, explore the chart and star coins you want to
              track.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npx vitest run src/pages/AssetPage.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```powershell
cd ..
git add dashboard/src/pages
git commit -m "feat(dashboard): add read-only trade view with pro chart toggle"
```

---

### Task 11: TopBar live search + route wiring

**Files:**
- Modify: `dashboard/src/layout/TopBar.tsx`
- Modify: `dashboard/src/layout/TopBar.test.tsx`
- Modify: `dashboard/src/layout/AppShell.test.tsx`
- Modify: `dashboard/src/App.tsx`
- Modify: `dashboard/src/App.test.tsx`

- [ ] **Step 1: Rewrite the TopBar test (search is now live)**

Replace `dashboard/src/layout/TopBar.test.tsx` with:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TopBar } from './TopBar'
import * as marketApi from '../api/market'

vi.mock('../api/market')

function Probe() {
  const { symbol } = useParams()
  return <p>trade view for {symbol}</p>
}

function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<TopBar />} />
          <Route path="/coins/:symbol" element={<><TopBar /><Probe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TopBar', () => {
  beforeEach(() => {
    vi.mocked(marketApi.getMarketAssets).mockResolvedValue({
      assets: [
        { symbol: 'BTC', name: 'Bitcoin', price: 64000, change_24h_pct: 0.01, high_24h: 0, low_24h: 0, volume_24h: 0, sparkline: [] },
        { symbol: 'ETH', name: 'Ethereum', price: 3400, change_24h_pct: 0.01, high_24h: 0, low_24h: 0, volume_24h: 0, sparkline: [] },
      ],
      stale: false,
      as_of: '2026-07-30T12:00:00Z',
    })
  })

  it('renders the brand', () => {
    renderBar()
    expect(screen.getByText('HedgeFund Sim')).toBeInTheDocument()
  })

  it('shows matches while typing and navigates on selection', async () => {
    renderBar()
    await userEvent.type(screen.getByPlaceholderText(/search coins/i), 'bit')
    const option = await screen.findByRole('button', { name: /bitcoin/i })
    await userEvent.click(option)
    expect(screen.getByText('trade view for BTC')).toBeInTheDocument()
  })

  it('shows no dropdown for a query with no matches', async () => {
    renderBar()
    await userEvent.type(screen.getByPlaceholderText(/search coins/i), 'zzz')
    expect(screen.queryByRole('button', { name: /bitcoin/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd dashboard
npx vitest run src/layout/TopBar.test.tsx
```

Expected: FAIL — the current TopBar's input is disabled and there is no dropdown.

- [ ] **Step 3: Implement the live search**

Replace `dashboard/src/layout/TopBar.tsx` with:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, Hexagon, Search, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { getMarketAssets } from '../api/market'
import { CoinIcon } from '../components/CoinIcon'
import { formatUsd } from '../lib/format'

const MAX_RESULTS = 5

export function TopBar() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { data } = useQuery({ queryKey: ['market-assets'], queryFn: getMarketAssets })

  const normalized = query.trim().toLowerCase()
  const matches = normalized
    ? (data?.assets ?? [])
        .filter(
          (asset) =>
            asset.symbol.toLowerCase().includes(normalized) ||
            asset.name.toLowerCase().includes(normalized),
        )
        .slice(0, MAX_RESULTS)
    : []

  const select = (symbol: string) => {
    setQuery('')
    navigate(`/coins/${symbol}`)
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <Hexagon className="size-5 text-primary" aria-hidden="true" />
        <span className="text-sm font-bold">HedgeFund Sim</span>
      </div>

      <form
        className="relative ml-4 hidden w-full max-w-xs md:block"
        onSubmit={(event) => {
          event.preventDefault()
          if (matches.length > 0) select(matches[0].symbol)
        }}
      >
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="global-search"
          name="search"
          autoComplete="off"
          placeholder="Search coins…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 pl-9"
        />
        {matches.length > 0 && (
          <div
            aria-label="Search results"
            className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
          >
            {matches.map((asset) => (
              <button
                key={asset.symbol}
                type="button"
                onClick={() => select(asset.symbol)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-200 hover:bg-accent"
              >
                <CoinIcon symbol={asset.symbol} className="size-7 text-[10px]" />
                <span className="flex-1 truncate text-sm">{asset.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatUsd(asset.price)}
                </span>
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="ml-auto flex items-center gap-4">
        <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
        <div
          aria-label="Your profile"
          className="flex size-8 items-center justify-center rounded-full bg-secondary text-muted-foreground"
        >
          <User className="size-4" aria-hidden="true" />
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Fix AppShell test harness (TopBar now needs QueryClient + fetch stub)**

In `dashboard/src/layout/AppShell.test.tsx`, wrap the render in a `QueryClientProvider` and stub fetch so the TopBar query stays pending. The test should read:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  })

  it('renders top bar, sidebar, and routed content', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<p>routed content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText('HedgeFund Sim')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument()
    expect(screen.getByText('routed content')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
```

(Keep any other assertions the current file has — e.g. a legacy-scope check — inside the same provider wrapper.)

- [ ] **Step 5: Wire the routes**

In `dashboard/src/App.tsx`:

1. Add imports: `import { MarketsPage } from './pages/MarketsPage'` and `import { AssetPage } from './pages/AssetPage'`. Remove `CandlestickChart` from the lucide import (no longer used).
2. Replace the `/markets` ComingSoon route with:

```tsx
        <Route path="/markets" element={<MarketsPage />} />
        <Route path="/coins/:symbol" element={<AssetPage />} />
```

3. In `dashboard/src/App.test.tsx`, replace the `'renders placeholders for the other beginner routes'` test with:

```tsx
  it('renders the Markets page at /markets', () => {
    renderAt('/markets')
    expect(screen.getByRole('heading', { name: 'Markets' })).toBeInTheDocument()
  })

  it('renders the trade view at /coins/:symbol', () => {
    renderAt('/coins/BTC')
    expect(screen.getByText('BTC')).toBeInTheDocument()
  })
```

(The stubbed never-resolving fetch keeps both pages in their loading state; the assertions target markup that renders regardless.)

- [ ] **Step 6: Run the full frontend suite and build**

```powershell
npm test
npm run build
```

Expected: all tests PASS; `tsc -b` and `vite build` clean.

- [ ] **Step 7: Commit**

```powershell
cd ..
git add dashboard/src
git commit -m "feat(dashboard): live coin search and markets/trade-view routes"
```

---

### Task 12: Manual smoke check + phase wrap-up

**Files:** none (verification only). Controller-driven — run in the main session with the dev servers, not in a subagent.

- [ ] **Step 1: Start both servers**

```powershell
# terminal 1 (repo root, venv active)
uvicorn hedgefund.api.app:app --reload
# terminal 2
cd dashboard; npm run dev
```

Open http://localhost:5173 and verify:

1. `/markets` lists all 20 universe coins with icon, name, price, daily %, sparkline; rows link to `/coins/:symbol`.
2. Starring a coin pins it to the top of the list and survives a reload (DB-backed).
3. Top-bar search: typing "bit" suggests Bitcoin; selecting navigates to `/coins/BTC`.
4. Trade view: line chart renders; timeframe pills switch ranges; Pro view switch shows candles + volume + SMA + RSI panes; 24h stats populated; "Trading opens soon" card in the right panel.
5. Prices refresh without a reload within ~30s (watch the network tab for polling).
6. Stop the backend → within one poll the Markets page shows the error/retry state (or the stale banner if the backend serves stale); restart backend → recovers.
7. No console errors on any visited route; `/lab/*` pages still work.

- [ ] **Step 2: Fix anything found, re-run suites, commit fixes**

```powershell
python -m pytest
cd dashboard; npm test; npm run build
git add -A
git commit -m "fix(dashboard): phase 2 smoke-check fixes"
```

(Skip the commit if the working tree is clean.)

- [ ] **Step 3: Done — phase exit criteria**

- All 20 coins browsable and searchable; watchlist star/unstar persisted.
- Trade view read-only chart with working Pro toggle.
- ccxt failure never breaks a page (stale banner or designed error + retry).
- Backend + frontend suites green; production build green.

Next: Phase 3 (Trading) — `docs/superpowers/plans/2026-07-30-beginner-frontend-phase3-trading.md`.
