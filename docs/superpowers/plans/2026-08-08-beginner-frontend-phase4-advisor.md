# Beginner Frontend Phase 4 (Advisor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the AI Advisor — grounded, plain-English trade suggestions with one-tap accept — on the Dashboard and the Trade view, with a deterministic template fallback so the card never breaks and never blocks on the LLM.

**Architecture:** A pure signals layer (`manual/signals.py`) computes SMA-cross / momentum / RSI facts per coin by reusing the existing tested indicator engine, plus portfolio context (idle cash, concentration). An orchestration layer (`manual/advice.py`) turns those facts into either an LLM-authored payload or deterministic template text, and persists the result in a new `advice_log` table that doubles as the cache. Advice is **generated on demand only** (a button), never on page load — `GET /advice` reads cache and never calls the LLM; `POST /advice` generates. Cache is busted whenever an order fills.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, pydantic v2, anthropic SDK (via the existing `get_call_llm` dependency), React 18, TanStack Query, shadcn/ui, Vitest + React Testing Library.

---

## Decisions locked before planning

These were settled with the user on 2026-08-08 and override the literal spec text where they differ:

| Question | Decision | Consequence |
|---|---|---|
| When is advice generated? | **On-demand button only** | `GET /advice` never calls the LLM. Zero LLM spend when nobody clicks. Spec §7's implied auto-fetch is deliberately not implemented. |
| Where does the advisor kill switch live? | **Phase 4, not Phase 5** | This phase replaces the Settings `ComingSoon` with a minimal Settings page carrying the advisor toggle. Phase 5 extends that same page with reset + starting cash. |
| Limit orders | **Cut from the redesign entirely** | Not this phase, not Phase 5. The order ticket stays market-only. Do not add a Limit tab to Pro view. |

**Advisor preference storage:** the user-facing on/off toggle is **localStorage**, not a database table. `MANUAL_ADVISOR_ENABLED` is the server-side hard kill switch. Rationale: this is a single-user app; a preference table would be a migration plus a repository plus routes to persist one boolean. YAGNI. The server env var is what actually protects spend; the client toggle is "don't show me this card."

---

## Context an implementer needs

**Read these before starting.** This plan assumes you know none of it.

- **Spec:** `docs/superpowers/specs/2026-07-30-beginner-frontend-redesign-design.md` — §5 (Trade view), §7 (Advisor pipeline), §10 (Error handling).
- **Phases 1–3 are DONE and merged to `main`.** The beginner shell, Markets, Trade view, and manual trading all work. This phase adds one new surface to two existing pages.
- **Branch first.** `main` auto-deploys to Render + Vercel and this phase adds an Alembic migration. Do not commit to `main`. Create `feature/beginner-frontend-phase4-advisor` off `main` before Task 1.
- **Sandbox cannot reach Binance** (ccxt geo-block, HTTP 451). `deps.py::get_market_data()` already uses `ccxt.kraken()` with `KRAKEN_LIVE_UNIVERSE` (15 of 20 pairs) — that is now permanent, committed in `3b24f3a`. No temporary swap needed anymore.
- **Caller commits.** Every `ManualRepository` method flushes but never commits; the route commits. Follow that.
- **Tests need Postgres.** `tests/api/conftest.py` connects to `TEST_DATABASE_URL` (default `postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test`). The `client` fixture already overrides `get_session`, `get_panel_loader`, and `get_market_data`.

### Baseline commands

```bash
# Backend (from repo root)
pytest -q                       # expect 184 passed at start of this phase

# Frontend
cd dashboard && npm test        # expect 141 passed at start of this phase
cd dashboard && npm run build   # must stay clean
```

---

## File Structure

### Backend — new files

| File | Responsibility |
|---|---|
| `migrations/versions/0006_add_advice_log.py` | Creates `advice_log`. |
| `src/hedgefund/manual/signals.py` | **Pure.** Candles + portfolio view → `CoinSignal` / `PortfolioContext` facts. No LLM, no DB, no I/O beyond the injected market provider. |
| `src/hedgefund/manual/advice.py` | Orchestration: symbol selection, prompt building, LLM call, JSON parse + safety validation, template fallback, cache read/write. |
| `tests/manual/test_signals.py` | Unit tests for the pure signal layer. |
| `tests/manual/test_advice.py` | Unit tests for prompt/parse/fallback/selection. |
| `tests/api/test_advice_routes.py` | Route tests with a fake `call_llm`. |

### Backend — modified files

| File | Change |
|---|---|
| `src/hedgefund/api/db/manual_models.py` | Add `AdviceLogRow`. |
| `src/hedgefund/api/db/manual_repository.py` | Add `get_fresh_advice`, `add_advice`, `clear_advice`. |
| `src/hedgefund/api/manual_schemas.py` | Add advice response schemas. |
| `src/hedgefund/api/routes/advice.py` | **New** route module. |
| `src/hedgefund/api/app.py` | Register the advice router. |
| `src/hedgefund/api/config.py` | Add `advisor_enabled`. |
| `src/hedgefund/manual/portfolio_service.py` | Bust the advice cache on fill. |

### Frontend — new files

| File | Responsibility |
|---|---|
| `dashboard/src/api/advice.ts` | `getAdvice`, `generateAdvice`. |
| `dashboard/src/hooks/usePlaceOrder.ts` | Shared order-placing mutation (toast + cache invalidation) used by both `OrderTicket` and `AdvisorCard`. |
| `dashboard/src/components/AdvisorCard.tsx` | The advisor surface. |
| `dashboard/src/pages/SettingsPage.tsx` | Minimal settings page (advisor toggle only this phase). |
| `dashboard/src/hooks/useAdvisorEnabled.ts` | localStorage-backed preference. |
| Matching `*.test.ts(x)` beside each. | |

### Frontend — modified files

| File | Change |
|---|---|
| `dashboard/src/types.ts` | Advice types. |
| `dashboard/src/components/OrderTicket.tsx` | Refactor onto `usePlaceOrder`. |
| `dashboard/src/pages/DashboardPage.tsx` | Mount `AdvisorCard`. |
| `dashboard/src/pages/AssetPage.tsx` | Mount per-coin `AdvisorCard`. |
| `dashboard/src/App.tsx` | Real `/settings` route. |

---

## Task 0: Branch

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main
git pull
git checkout -b feature/beginner-frontend-phase4-advisor
```

- [ ] **Step 2: Confirm the baseline is green**

Run: `pytest -q`
Expected: `184 passed`

Run: `cd dashboard && npm test`
Expected: `141 passed`

If either is red, stop and report — do not start implementing on a red baseline.

---

## Task 1: `advice_log` table + model

**Files:**
- Create: `migrations/versions/0006_add_advice_log.py`
- Modify: `src/hedgefund/api/db/manual_models.py`
- Test: `tests/api/test_manual_repository.py`

**Design note — why a `scope` string and not a nullable `symbol`:** advice comes in two flavors, portfolio-wide (Dashboard) and per-coin (Trade view). A nullable `symbol` column forces `IS NULL` vs `= :sym` branching at every query site. A non-null `scope` string holding either the literal `"portfolio"` or the base symbol (`"BTC"`) keeps every query a plain equality match. `"portfolio"` can never collide with a base symbol because base symbols are uppercase.

- [ ] **Step 1: Write the failing test**

Append to `tests/api/test_manual_repository.py`:

```python
def test_add_and_get_fresh_advice_round_trips_payload(session):
    repo = ManualRepository(session)
    portfolio = repo.create_portfolio(100_000.0)
    payload = {"suggestions": [{"text": "hi", "why": "because", "action": None}]}

    repo.add_advice(portfolio.id, scope="portfolio", payload=payload)

    row = repo.get_fresh_advice(
        portfolio.id, scope="portfolio",
        not_before=datetime(2000, 1, 1, tzinfo=timezone.utc),
    )
    assert row is not None
    assert row.payload == payload


def test_get_fresh_advice_ignores_rows_older_than_cutoff(session):
    repo = ManualRepository(session)
    portfolio = repo.create_portfolio(100_000.0)
    repo.add_advice(portfolio.id, scope="portfolio", payload={"suggestions": []})

    future = datetime.now(timezone.utc) + timedelta(minutes=5)
    assert repo.get_fresh_advice(portfolio.id, scope="portfolio", not_before=future) is None


def test_get_fresh_advice_is_scoped_per_symbol(session):
    repo = ManualRepository(session)
    portfolio = repo.create_portfolio(100_000.0)
    repo.add_advice(portfolio.id, scope="BTC", payload={"suggestions": [], "s": "btc"})

    cutoff = datetime(2000, 1, 1, tzinfo=timezone.utc)
    assert repo.get_fresh_advice(portfolio.id, scope="BTC", not_before=cutoff) is not None
    assert repo.get_fresh_advice(portfolio.id, scope="ETH", not_before=cutoff) is None


def test_get_fresh_advice_returns_newest_row_for_scope(session):
    repo = ManualRepository(session)
    portfolio = repo.create_portfolio(100_000.0)
    repo.add_advice(portfolio.id, scope="portfolio", payload={"n": 1})
    repo.add_advice(portfolio.id, scope="portfolio", payload={"n": 2})

    row = repo.get_fresh_advice(
        portfolio.id, scope="portfolio",
        not_before=datetime(2000, 1, 1, tzinfo=timezone.utc),
    )
    assert row.payload == {"n": 2}


def test_clear_advice_removes_every_scope_for_the_portfolio(session):
    repo = ManualRepository(session)
    portfolio = repo.create_portfolio(100_000.0)
    repo.add_advice(portfolio.id, scope="portfolio", payload={})
    repo.add_advice(portfolio.id, scope="BTC", payload={})

    removed = repo.clear_advice(portfolio.id)

    cutoff = datetime(2000, 1, 1, tzinfo=timezone.utc)
    assert removed == 2
    assert repo.get_fresh_advice(portfolio.id, scope="portfolio", not_before=cutoff) is None
    assert repo.get_fresh_advice(portfolio.id, scope="BTC", not_before=cutoff) is None
```

Make sure the imports at the top of that file include what these tests use:

```python
from datetime import datetime, timedelta, timezone
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/api/test_manual_repository.py -q -k advice`
Expected: FAIL — `AttributeError: 'ManualRepository' object has no attribute 'add_advice'`

- [ ] **Step 3: Add the model**

Append to `src/hedgefund/api/db/manual_models.py`:

```python
class AdviceLogRow(Base):
    __tablename__ = "advice_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("portfolios.id"), nullable=False
    )
    # Either the literal "portfolio" (dashboard-wide advice) or a base symbol
    # ("BTC"). Non-null so every lookup is a plain equality match; "portfolio"
    # cannot collide with a base symbol because base symbols are uppercase.
    scope: Mapped[str] = mapped_column(String, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # clock_timestamp() so two rows written in one transaction still order
    # deterministically — get_fresh_advice() takes the newest per scope.
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )
```

Update that file's imports — it currently imports `UUID` from the postgres dialect but not `JSONB`:

```python
from sqlalchemy.dialects.postgresql import JSONB, UUID
```

- [ ] **Step 4: Write the migration**

Create `migrations/versions/0006_add_advice_log.py`:

```python
"""add advice_log table

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "advice_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("portfolio_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("portfolios.id"), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("clock_timestamp()"), nullable=False),
    )
    op.create_index(
        "ix_advice_log_portfolio_scope_generated",
        "advice_log",
        ["portfolio_id", "scope", "generated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_advice_log_portfolio_scope_generated", table_name="advice_log")
    op.drop_table("advice_log")
```

- [ ] **Step 5: Add the repository methods**

In `src/hedgefund/api/db/manual_repository.py`, extend the import of models:

```python
from hedgefund.api.db.manual_models import (
    AdviceLogRow,
    ManualOrderRow,
    PortfolioEquityRow,
    PortfolioRow,
    WatchlistRow,
)
```

Add `delete` to the sqlalchemy import:

```python
from sqlalchemy import delete, select, text
```

Append these methods to the `ManualRepository` class:

```python
    # ---- advice cache (Phase 4) ----

    def get_fresh_advice(
        self, portfolio_id: uuid.UUID, *, scope: str, not_before: datetime
    ) -> AdviceLogRow | None:
        """Newest advice row for this (portfolio, scope) generated at or after
        `not_before`. The TTL lives in the service layer, which computes the
        cutoff — the repository only answers 'is there one this recent'."""
        stmt = (
            select(AdviceLogRow)
            .where(
                AdviceLogRow.portfolio_id == portfolio_id,
                AdviceLogRow.scope == scope,
                AdviceLogRow.generated_at >= not_before,
            )
            .order_by(AdviceLogRow.generated_at.desc())
            .limit(1)
        )
        return self._s.scalars(stmt).first()

    def add_advice(
        self, portfolio_id: uuid.UUID, *, scope: str, payload: dict
    ) -> AdviceLogRow:
        row = AdviceLogRow(
            id=uuid.uuid4(), portfolio_id=portfolio_id, scope=scope, payload=payload
        )
        self._s.add(row)
        self._s.flush()
        return row

    def clear_advice(self, portfolio_id: uuid.UUID) -> int:
        """Drop every cached scope for this portfolio. Called when an order
        fills — a new position invalidates portfolio-wide *and* per-coin advice.
        Returns the number of rows removed."""
        result = self._s.execute(
            delete(AdviceLogRow).where(AdviceLogRow.portfolio_id == portfolio_id)
        )
        self._s.flush()
        return result.rowcount
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pytest tests/api/test_manual_repository.py -q`
Expected: PASS (all previous tests plus the 5 new ones)

- [ ] **Step 7: Verify the migration applies cleanly**

```bash
alembic upgrade head
alembic downgrade -1
alembic upgrade head
```

Expected: no errors on any of the three. The down-then-up proves `downgrade()` is real, not decorative.

- [ ] **Step 8: Commit**

```bash
git add migrations/versions/0006_add_advice_log.py src/hedgefund/api/db/manual_models.py src/hedgefund/api/db/manual_repository.py tests/api/test_manual_repository.py
git commit -m "feat(advice): add advice_log table, model, and repository cache methods"
```

---

## Task 2: Pure signal computation

**Files:**
- Create: `src/hedgefund/manual/signals.py`
- Test: `tests/manual/test_signals.py`

**Design note:** this module reuses `hedgefund.engine.indicators.compute_indicator` rather than reimplementing RSI/SMA. That engine operates on a `(dates × symbols)` DataFrame, so we build a one-column frame per coin. This keeps a single tested implementation of RSI in the codebase — do not hand-roll a second one here.

- [ ] **Step 1: Write the failing test**

Create `tests/manual/test_signals.py`:

```python
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from hedgefund.manual import signals as sig
from hedgefund.manual.market_data import Candle


def _series(closes: list[float]) -> tuple[Candle, ...]:
    base = datetime(2026, 8, 1, tzinfo=timezone.utc)
    return tuple(
        Candle(ts=base + timedelta(hours=i), open=c, high=c, low=c, close=c, volume=1.0)
        for i, c in enumerate(closes)
    )


def test_coin_signal_reports_golden_cross_when_short_sma_is_above_long():
    # 60 rising closes: the 5-period mean sits above the 20-period mean.
    candles = _series([100.0 + i for i in range(60)])

    signal = sig.coin_signal("BTC", candles, short_period=5, long_period=20, rsi_period=14)

    assert signal.sma_cross == "golden"
    assert signal.sma_short > signal.sma_long


def test_coin_signal_reports_death_cross_when_short_sma_is_below_long():
    candles = _series([160.0 - i for i in range(60)])

    signal = sig.coin_signal("BTC", candles, short_period=5, long_period=20, rsi_period=14)

    assert signal.sma_cross == "death"


def test_coin_signal_flags_overbought_when_every_bar_rises():
    # Uninterrupted gains drive RSI to 100.
    candles = _series([100.0 + i for i in range(60)])

    signal = sig.coin_signal("BTC", candles, short_period=5, long_period=20, rsi_period=14)

    assert signal.rsi_zone == "overbought"
    assert signal.rsi > 70


def test_coin_signal_flags_oversold_when_every_bar_falls():
    candles = _series([160.0 - i for i in range(60)])

    signal = sig.coin_signal("BTC", candles, short_period=5, long_period=20, rsi_period=14)

    assert signal.rsi_zone == "oversold"
    assert signal.rsi < 30


def test_coin_signal_returns_none_facts_when_history_is_too_short():
    # 3 bars cannot fill a 20-period SMA or a 14-period RSI.
    signal = sig.coin_signal("BTC", _series([100.0, 101.0, 102.0]),
                             short_period=5, long_period=20, rsi_period=14)

    assert signal.sma_short is None
    assert signal.sma_long is None
    assert signal.rsi is None
    assert signal.sma_cross == "none"
    assert signal.rsi_zone == "neutral"


def test_coin_signal_raises_on_empty_candles():
    with pytest.raises(ValueError, match="no candles"):
        sig.coin_signal("BTC", (), short_period=5, long_period=20, rsi_period=14)


def test_portfolio_context_computes_idle_cash_and_concentration():
    ctx = sig.portfolio_context(
        equity=1000.0, cash=250.0, total_return_pct=0.10,
        positions=[("BTC", 600.0), ("ETH", 150.0)],
    )

    assert ctx.idle_cash_pct == pytest.approx(0.25)
    assert ctx.top_symbol == "BTC"
    assert ctx.top_concentration_pct == pytest.approx(0.60)
    assert ctx.holdings_count == 2


def test_portfolio_context_handles_an_all_cash_portfolio():
    ctx = sig.portfolio_context(
        equity=1000.0, cash=1000.0, total_return_pct=0.0, positions=[]
    )

    assert ctx.idle_cash_pct == pytest.approx(1.0)
    assert ctx.top_symbol is None
    assert ctx.top_concentration_pct == 0.0
    assert ctx.holdings_count == 0


def test_portfolio_context_treats_zero_equity_as_no_concentration():
    # A wiped-out portfolio must not divide by zero.
    ctx = sig.portfolio_context(
        equity=0.0, cash=0.0, total_return_pct=-1.0, positions=[]
    )

    assert ctx.idle_cash_pct == 0.0
    assert ctx.top_concentration_pct == 0.0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/manual/test_signals.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'hedgefund.manual.signals'`

- [ ] **Step 3: Write the implementation**

Create `src/hedgefund/manual/signals.py`:

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/manual/test_signals.py -q`
Expected: PASS — 9 passed

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/manual/signals.py tests/manual/test_signals.py
git commit -m "feat(advice): pure signal layer reusing the indicator engine"
```

---

## Task 3: Symbol selection + template fallback

**Files:**
- Create: `src/hedgefund/manual/advice.py`
- Test: `tests/manual/test_advice.py`

**Design note — why symbol selection matters:** computing signals means one `get_candles` call per coin. Running that across all 15 universe coins on a cold cache is 15 sequential ccxt round-trips inside one request. Bound it: held coins first (they are what the user actually cares about), then the largest absolute 24h movers to fill, capped at `MAX_ADVICE_SYMBOLS`.

- [ ] **Step 1: Write the failing test**

Create `tests/manual/test_advice.py`:

```python
from __future__ import annotations

import json

import pytest

from hedgefund.manual import advice as adv
from hedgefund.manual.signals import CoinSignal, PortfolioContext
from tests.fixtures.market import make_quote


def _signal(symbol: str, *, cross="none", zone="neutral", momentum=0.0, price=100.0) -> CoinSignal:
    return CoinSignal(
        symbol=symbol, price=price, sma_short=1.0, sma_long=1.0,
        sma_cross=cross, rsi=50.0, rsi_zone=zone, momentum_pct=momentum,
    )


def _context(**overrides) -> PortfolioContext:
    base = dict(
        equity=10_000.0, cash=5_000.0, idle_cash_pct=0.5,
        top_symbol="BTC", top_concentration_pct=0.4,
        holdings_count=2, total_return_pct=0.05,
    )
    base.update(overrides)
    return PortfolioContext(**base)


# ---- symbol selection ----

def test_select_symbols_puts_held_coins_first():
    quotes = [make_quote("BTC", "Bitcoin", 100.0), make_quote("ETH", "Ethereum", 10.0)]

    picked = adv.select_symbols(held=["ETH"], quotes=quotes, limit=2)

    assert picked[0] == "ETH"


def test_select_symbols_fills_remaining_slots_with_biggest_movers():
    quotes = [
        make_quote("BTC", "Bitcoin", 100.0, change=0.01),
        make_quote("ETH", "Ethereum", 10.0, change=-0.30),
        make_quote("SOL", "Solana", 5.0, change=0.05),
    ]

    picked = adv.select_symbols(held=[], quotes=quotes, limit=2)

    # ETH moved 30% (absolute), SOL 5%, BTC 1%.
    assert picked == ["ETH", "SOL"]


def test_select_symbols_never_duplicates_a_held_coin():
    quotes = [make_quote("BTC", "Bitcoin", 100.0, change=0.90)]

    picked = adv.select_symbols(held=["BTC"], quotes=quotes, limit=3)

    assert picked == ["BTC"]


def test_select_symbols_respects_the_cap():
    quotes = [make_quote(s, s, 10.0, change=0.1) for s in ("A", "B", "C", "D", "E", "F", "G")]

    picked = adv.select_symbols(held=["A", "B", "C", "D", "E"], quotes=quotes, limit=3)

    assert len(picked) == 3


# ---- template fallback ----

def test_template_advice_always_returns_at_least_one_suggestion():
    suggestions = adv.template_advice([], _context())

    assert len(suggestions) >= 1


def test_template_advice_never_exceeds_three_suggestions():
    signals = [_signal(s, cross="golden", zone="oversold", momentum=0.5)
               for s in ("A", "B", "C", "D", "E")]

    suggestions = adv.template_advice(signals, _context())

    assert len(suggestions) <= 3


def test_template_advice_flags_idle_cash():
    suggestions = adv.template_advice([], _context(idle_cash_pct=0.95, holdings_count=0))

    assert any("cash" in s.text.lower() for s in suggestions)


def test_template_advice_flags_concentration():
    ctx = _context(idle_cash_pct=0.05, top_symbol="BTC",
                   top_concentration_pct=0.85, holdings_count=1)

    suggestions = adv.template_advice([], ctx)

    assert any("BTC" in s.text for s in suggestions)


def test_template_advice_mentions_an_oversold_coin_by_name():
    suggestions = adv.template_advice([_signal("SOL", zone="oversold")], _context())

    assert any("SOL" in s.text for s in suggestions)


def test_template_suggestions_carry_no_one_tap_action():
    # The deterministic fallback describes; it never proposes a concrete order.
    suggestions = adv.template_advice([_signal("SOL", zone="oversold")], _context())

    assert all(s.action is None for s in suggestions)


# ---- prompt ----

def test_build_prompt_includes_every_signal_symbol():
    prompt = adv.build_prompt([_signal("BTC"), _signal("ETH")], _context(), scope="portfolio")

    assert "BTC" in prompt
    assert "ETH" in prompt


def test_build_prompt_states_the_json_contract():
    prompt = adv.build_prompt([_signal("BTC")], _context(), scope="portfolio")

    assert "suggestions" in prompt
    assert "usd_amount" in prompt


def test_build_prompt_names_the_focus_coin_when_scoped_to_one():
    prompt = adv.build_prompt([_signal("BTC")], _context(), scope="BTC")

    assert "BTC" in prompt
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/manual/test_advice.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'hedgefund.manual.advice'`

- [ ] **Step 3: Write the implementation**

Create `src/hedgefund/manual/advice.py`:

```python
from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from typing import Literal

from hedgefund.manual.market_data import AssetQuote
from hedgefund.manual.signals import CoinSignal, PortfolioContext

DISCLAIMER = "Simulated learning advice — not financial advice."
MAX_ADVICE_SYMBOLS = 6
MAX_SUGGESTIONS = 3
PORTFOLIO_SCOPE = "portfolio"

# Thresholds that trigger a template line. Named so the intent is readable.
IDLE_CASH_THRESHOLD = 0.60
CONCENTRATION_THRESHOLD = 0.50


@dataclass(frozen=True)
class SuggestionAction:
    side: Literal["buy", "sell"]
    symbol: str
    usd_amount: float


@dataclass(frozen=True)
class Suggestion:
    text: str
    why: str
    action: SuggestionAction | None = None


def select_symbols(
    *, held: Sequence[str], quotes: Sequence[AssetQuote], limit: int = MAX_ADVICE_SYMBOLS
) -> list[str]:
    """Held coins first, then the biggest absolute 24h movers, capped at `limit`.

    Bounds the number of get_candles() calls one advice request can trigger.
    """
    known = {q.symbol for q in quotes}
    picked = [s for s in held if s in known][:limit]

    movers = sorted(quotes, key=lambda q: abs(q.change_24h_pct), reverse=True)
    for quote in movers:
        if len(picked) >= limit:
            break
        if quote.symbol not in picked:
            picked.append(quote.symbol)
    return picked


def template_advice(
    signals: Sequence[CoinSignal], context: PortfolioContext
) -> list[Suggestion]:
    """Deterministic advice from the same facts the LLM would have seen.

    This is the fallback that fires whenever the LLM is unavailable, slow, or
    returns something unparseable — the card must never break. It deliberately
    proposes no one-tap action: a template has no judgement about size.
    """
    out: list[Suggestion] = []

    if context.holdings_count == 0:
        out.append(Suggestion(
            text="Your portfolio is all cash — consider making a first small buy.",
            why=(
                f"You are holding {context.cash:,.0f} dollars in buying power and own no "
                "coins yet. Starting small is the usual way to learn how price moves feel."
            ),
        ))
    elif context.idle_cash_pct >= IDLE_CASH_THRESHOLD:
        out.append(Suggestion(
            text=f"About {context.idle_cash_pct:.0%} of your portfolio is sitting in cash.",
            why=(
                "Idle cash earns nothing in this simulator. That is fine if it is "
                "deliberate — worth noticing if it is not."
            ),
        ))

    if (
        context.top_symbol is not None
        and context.top_concentration_pct >= CONCENTRATION_THRESHOLD
    ):
        out.append(Suggestion(
            text=(
                f"{context.top_symbol} is {context.top_concentration_pct:.0%} of your "
                "portfolio — that is concentrated."
            ),
            why=(
                f"When one coin dominates, your total return mostly tracks that coin. "
                f"Spreading across more coins reduces how much a single {context.top_symbol} "
                "move swings your balance."
            ),
        ))

    for signal in signals:
        if len(out) >= MAX_SUGGESTIONS:
            break
        if signal.rsi_zone == "oversold":
            out.append(Suggestion(
                text=f"{signal.symbol} looks oversold right now.",
                why=(
                    f"Its RSI is {signal.rsi:.0f}, below the 30 line traders treat as "
                    "oversold. That often follows a sharp fall — it is a signal, not a "
                    "guarantee of a bounce."
                ),
            ))
        elif signal.rsi_zone == "overbought":
            out.append(Suggestion(
                text=f"{signal.symbol} looks overbought right now.",
                why=(
                    f"Its RSI is {signal.rsi:.0f}, above the 70 line traders treat as "
                    "overbought — the recent run has been steep."
                ),
            ))
        elif signal.sma_cross == "golden":
            out.append(Suggestion(
                text=f"{signal.symbol} is trending up on its short-term average.",
                why=(
                    "Its 5-period average is above its 20-period average, which traders "
                    "read as short-term strength."
                ),
            ))

    if not out:
        out.append(Suggestion(
            text="Nothing stands out in your portfolio right now.",
            why=(
                "No coin you hold or track is showing an overbought, oversold, or "
                "trend-crossing signal, and your cash and concentration look balanced."
            ),
        ))

    return out[:MAX_SUGGESTIONS]


def build_prompt(
    signals: Sequence[CoinSignal], context: PortfolioContext, *, scope: str
) -> str:
    """Compact structured summary + an explicit JSON contract."""
    facts = [
        {
            "symbol": s.symbol,
            "price": round(s.price, 4),
            "sma_cross": s.sma_cross,
            "rsi": None if s.rsi is None else round(s.rsi, 1),
            "rsi_zone": s.rsi_zone,
            "momentum_24_pct": None if s.momentum_pct is None else round(s.momentum_pct * 100, 2),
        }
        for s in signals
    ]
    portfolio = {
        "equity_usd": round(context.equity, 2),
        "buying_power_usd": round(context.cash, 2),
        "idle_cash_pct": round(context.idle_cash_pct * 100, 1),
        "largest_holding": context.top_symbol,
        "largest_holding_pct": round(context.top_concentration_pct * 100, 1),
        "holdings_count": context.holdings_count,
        "total_return_pct": round(context.total_return_pct * 100, 2),
    }

    focus = (
        "The user is looking at the whole portfolio."
        if scope == PORTFOLIO_SCOPE
        else f"The user is looking at the {scope} trade page. Focus your advice on {scope}."
    )

    return f"""You are a friendly trading coach inside a *simulated* crypto paper-trading app for absolute beginners. No real money is involved.

{focus}

Market signals:
{json.dumps(facts, indent=2)}

Portfolio:
{json.dumps(portfolio, indent=2)}

Write 2-3 short suggestions grounded ONLY in the numbers above. Do not invent
prices, news, or indicators that are not listed. Explain like the reader has
never traded before: no jargon without a plain-English gloss.

Respond with JSON only, no prose and no code fences, in exactly this shape:

{{
  "suggestions": [
    {{
      "text": "one sentence, under 120 characters",
      "why": "two or three sentences explaining the reasoning in plain English",
      "action": {{"side": "buy", "symbol": "BTC", "usd_amount": 250}}
    }}
  ]
}}

"action" is optional — set it to null unless you are proposing a specific,
affordable trade. Never propose a buy larger than the buying power shown above.
Never propose selling a coin the portfolio does not hold."""


def suggestions_to_payload(suggestions: Sequence[Suggestion], *, source: str) -> dict:
    """Serialize for the advice_log JSONB column and the API response."""
    return {
        "suggestions": [asdict(s) for s in suggestions],
        "disclaimer": DISCLAIMER,
        "source": source,
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/manual/test_advice.py -q`
Expected: PASS — 12 passed

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/manual/advice.py tests/manual/test_advice.py
git commit -m "feat(advice): symbol selection, template fallback, and prompt builder"
```

---

## Task 4: LLM response parsing with safety validation

**Files:**
- Modify: `src/hedgefund/manual/advice.py`
- Test: `tests/manual/test_advice.py`

**Design note — why parsing needs a safety pass, not just a schema check:** the LLM can return well-formed JSON proposing a $50,000 buy against $200 of buying power, or a sell of a coin the user does not own. Handing that to a one-tap button would produce a guaranteed 400 the moment the user taps it. Validate actions against reality and **strip the action while keeping the text** when it fails — a suggestion with no button is still useful advice.

- [ ] **Step 1: Write the failing test**

Append to `tests/manual/test_advice.py`:

```python
# ---- LLM response parsing ----

_GOOD = """{"suggestions": [
  {"text": "Consider buying BTC", "why": "It is oversold.",
   "action": {"side": "buy", "symbol": "BTC", "usd_amount": 100}},
  {"text": "Watch ETH", "why": "Nothing to do yet.", "action": null}
]}"""


def test_parse_llm_advice_reads_a_well_formed_response():
    parsed = adv.parse_llm_advice(_GOOD, known_symbols={"BTC", "ETH"},
                                  cash=1_000.0, holdings={})

    assert len(parsed) == 2
    assert parsed[0].action.side == "buy"
    assert parsed[0].action.usd_amount == 100
    assert parsed[1].action is None


def test_parse_llm_advice_tolerates_markdown_code_fences():
    fenced = f"```json\n{_GOOD}\n```"

    parsed = adv.parse_llm_advice(fenced, known_symbols={"BTC", "ETH"},
                                  cash=1_000.0, holdings={})

    assert len(parsed) == 2


def test_parse_llm_advice_tolerates_leading_prose():
    noisy = f"Sure! Here is my advice:\n\n{_GOOD}"

    parsed = adv.parse_llm_advice(noisy, known_symbols={"BTC", "ETH"},
                                  cash=1_000.0, holdings={})

    assert len(parsed) == 2


def test_parse_llm_advice_rejects_non_json():
    with pytest.raises(adv.AdviceParseError):
        adv.parse_llm_advice("I cannot help with that.",
                             known_symbols={"BTC"}, cash=1_000.0, holdings={})


def test_parse_llm_advice_rejects_an_empty_suggestion_list():
    with pytest.raises(adv.AdviceParseError):
        adv.parse_llm_advice('{"suggestions": []}',
                             known_symbols={"BTC"}, cash=1_000.0, holdings={})


def test_parse_llm_advice_caps_the_suggestion_count():
    many = json.dumps({"suggestions": [
        {"text": f"t{i}", "why": "w", "action": None} for i in range(9)
    ]})

    parsed = adv.parse_llm_advice(many, known_symbols={"BTC"}, cash=1_000.0, holdings={})

    assert len(parsed) == adv.MAX_SUGGESTIONS


def test_parse_llm_advice_strips_an_unaffordable_buy_but_keeps_the_text():
    body = json.dumps({"suggestions": [
        {"text": "Buy a lot of BTC", "why": "why",
         "action": {"side": "buy", "symbol": "BTC", "usd_amount": 999_999}}
    ]})

    parsed = adv.parse_llm_advice(body, known_symbols={"BTC"}, cash=100.0, holdings={})

    assert parsed[0].text == "Buy a lot of BTC"
    assert parsed[0].action is None


def test_parse_llm_advice_strips_a_sell_of_an_unheld_coin():
    body = json.dumps({"suggestions": [
        {"text": "Sell ETH", "why": "why",
         "action": {"side": "sell", "symbol": "ETH", "usd_amount": 50}}
    ]})

    parsed = adv.parse_llm_advice(body, known_symbols={"BTC", "ETH"},
                                  cash=1_000.0, holdings={})

    assert parsed[0].action is None


def test_parse_llm_advice_keeps_a_sell_within_the_held_value():
    body = json.dumps({"suggestions": [
        {"text": "Trim ETH", "why": "why",
         "action": {"side": "sell", "symbol": "ETH", "usd_amount": 40}}
    ]})

    parsed = adv.parse_llm_advice(body, known_symbols={"BTC", "ETH"},
                                  cash=1_000.0, holdings={"ETH": 100.0})

    assert parsed[0].action.side == "sell"
    assert parsed[0].action.usd_amount == 40


def test_parse_llm_advice_strips_an_action_for_an_unknown_symbol():
    body = json.dumps({"suggestions": [
        {"text": "Buy DOGECOINX", "why": "why",
         "action": {"side": "buy", "symbol": "DOGECOINX", "usd_amount": 10}}
    ]})

    parsed = adv.parse_llm_advice(body, known_symbols={"BTC"}, cash=1_000.0, holdings={})

    assert parsed[0].action is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/manual/test_advice.py -q -k parse`
Expected: FAIL — `AttributeError: module 'hedgefund.manual.advice' has no attribute 'parse_llm_advice'`

- [ ] **Step 3: Write the implementation**

Add to `src/hedgefund/manual/advice.py`. Extend the imports:

```python
from pydantic import BaseModel, Field, ValidationError
```

Then append:

```python
class AdviceParseError(ValueError):
    """The LLM response could not be read as advice. Caller falls back to templates."""


class _LLMAction(BaseModel):
    side: Literal["buy", "sell"]
    symbol: str
    usd_amount: float = Field(gt=0)


class _LLMSuggestion(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    why: str = Field(min_length=1, max_length=800)
    action: _LLMAction | None = None


class _LLMAdvice(BaseModel):
    suggestions: list[_LLMSuggestion] = Field(min_length=1)


def _extract_json_object(text: str) -> str:
    """Pull the outermost {...} out of a response that may carry code fences or
    a chatty preamble. Models do this often enough that failing on it would
    push us to the template fallback for no good reason."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise AdviceParseError("no JSON object found in response")
    return text[start : end + 1]


def _action_is_safe(
    action: _LLMAction, *, known_symbols: set[str], cash: float, holdings: dict[str, float]
) -> bool:
    """Would this action survive POST /portfolio/orders right now?

    A one-tap button that is guaranteed to 400 is worse than no button, so an
    unsafe action is dropped while the suggestion's text is kept.
    """
    if action.symbol not in known_symbols:
        return False
    if action.side == "buy":
        return action.usd_amount <= cash
    return action.usd_amount <= holdings.get(action.symbol, 0.0)


def parse_llm_advice(
    raw: str, *, known_symbols: set[str], cash: float, holdings: dict[str, float]
) -> list[Suggestion]:
    """Parse and sanity-check an LLM advice response.

    `holdings` maps symbol → current market value in USD.
    Raises AdviceParseError on anything unusable; the caller then falls back to
    template_advice().
    """
    try:
        parsed = _LLMAdvice.model_validate_json(_extract_json_object(raw))
    except (ValidationError, ValueError) as exc:
        raise AdviceParseError(str(exc)) from exc

    out: list[Suggestion] = []
    for item in parsed.suggestions[:MAX_SUGGESTIONS]:
        action = None
        if item.action is not None and _action_is_safe(
            item.action, known_symbols=known_symbols, cash=cash, holdings=holdings
        ):
            action = SuggestionAction(
                side=item.action.side,
                symbol=item.action.symbol,
                usd_amount=item.action.usd_amount,
            )
        out.append(Suggestion(text=item.text, why=item.why, action=action))
    return out
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/manual/test_advice.py -q`
Expected: PASS — 22 passed

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/manual/advice.py tests/manual/test_advice.py
git commit -m "feat(advice): parse LLM responses with affordability and ownership guards"
```

---

## Task 5: The generate/read service functions

**Files:**
- Modify: `src/hedgefund/manual/advice.py`
- Create: `tests/conftest.py`
- Modify: `tests/api/conftest.py`
- Test: `tests/manual/test_advice.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/manual/test_advice.py`:

```python
# ---- generation orchestration ----

class _FakeRepo:
    """Minimal stand-in for ManualRepository — only what advice.py calls."""

    def __init__(self):
        self.rows: list[tuple[str, dict]] = []
        self.cleared = 0

    def get_fresh_advice(self, portfolio_id, *, scope, not_before):
        for row_scope, payload in reversed(self.rows):
            if row_scope == scope:
                return type("Row", (), {"payload": payload, "generated_at": not_before})()
        return None

    def add_advice(self, portfolio_id, *, scope, payload):
        self.rows.append((scope, payload))
        return type("Row", (), {"payload": payload})()

    def clear_advice(self, portfolio_id):
        self.cleared += 1
        return 0


def _view(cash=5_000.0, positions=()):
    import uuid
    from datetime import datetime, timezone

    from hedgefund.manual.portfolio_service import PortfolioViewData

    return PortfolioViewData(
        portfolio_id=uuid.uuid4(), starting_cash=10_000.0, cash=cash,
        positions=tuple(positions), equity=10_000.0, today_pl=0.0,
        total_return_pct=0.0, stale=False,
        created_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )


def test_generate_advice_uses_the_llm_when_it_returns_valid_json(market_data):
    repo = _FakeRepo()
    calls = []

    def fake_llm(messages, model="m", max_tokens=1024):
        calls.append(messages)
        return _GOOD, 0.001

    result = adv.generate_advice(
        repo, market_data, fake_llm, view=_view(), scope=adv.PORTFOLIO_SCOPE
    )

    assert result["source"] == "llm"
    assert len(result["suggestions"]) == 2
    assert len(calls) == 1


def test_generate_advice_falls_back_to_templates_when_the_llm_raises(market_data):
    repo = _FakeRepo()

    def boom(messages, model="m", max_tokens=1024):
        raise RuntimeError("anthropic is down")

    result = adv.generate_advice(
        repo, market_data, boom, view=_view(), scope=adv.PORTFOLIO_SCOPE
    )

    assert result["source"] == "template"
    assert len(result["suggestions"]) >= 1


def test_generate_advice_falls_back_when_the_llm_returns_garbage(market_data):
    repo = _FakeRepo()

    result = adv.generate_advice(
        repo, market_data, lambda *a, **k: ("nope", 0.0),
        view=_view(), scope=adv.PORTFOLIO_SCOPE,
    )

    assert result["source"] == "template"


def test_generate_advice_always_carries_the_disclaimer(market_data):
    repo = _FakeRepo()

    result = adv.generate_advice(
        repo, market_data, lambda *a, **k: ("nope", 0.0),
        view=_view(), scope=adv.PORTFOLIO_SCOPE,
    )

    assert result["disclaimer"] == adv.DISCLAIMER


def test_generate_advice_writes_the_result_to_the_cache(market_data):
    repo = _FakeRepo()

    adv.generate_advice(repo, market_data, lambda *a, **k: (_GOOD, 0.0),
                        view=_view(), scope=adv.PORTFOLIO_SCOPE)

    assert len(repo.rows) == 1
    assert repo.rows[0][0] == adv.PORTFOLIO_SCOPE


def test_generate_advice_reuses_a_fresh_cache_entry_without_calling_the_llm(market_data):
    repo = _FakeRepo()
    repo.rows.append((adv.PORTFOLIO_SCOPE, {"suggestions": [], "source": "llm",
                                            "disclaimer": adv.DISCLAIMER}))
    called = []

    adv.generate_advice(repo, market_data,
                        lambda *a, **k: called.append(1) or (_GOOD, 0.0),
                        view=_view(), scope=adv.PORTFOLIO_SCOPE)

    assert called == []


def test_read_cached_advice_returns_none_when_nothing_is_cached():
    assert adv.read_cached_advice(_FakeRepo(), _view().portfolio_id,
                                  scope=adv.PORTFOLIO_SCOPE) is None


def test_generate_advice_for_a_single_coin_scopes_to_that_symbol(market_data):
    repo = _FakeRepo()

    adv.generate_advice(repo, market_data, lambda *a, **k: (_GOOD, 0.0),
                        view=_view(), scope="BTC")

    assert repo.rows[0][0] == "BTC"
```

These tests need the `market_data` fixture, which currently lives only in `tests/api/conftest.py`. Move it up so both packages share it — create `tests/conftest.py`:

```python
from __future__ import annotations

import pytest


@pytest.fixture
def market_data():
    from tests.fixtures.market import FakeMarketData

    return FakeMarketData()
```

and delete the now-duplicated `market_data` fixture from `tests/api/conftest.py` (leave every other fixture in that file untouched).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/manual/test_advice.py -q -k generate`
Expected: FAIL — `AttributeError: module 'hedgefund.manual.advice' has no attribute 'generate_advice'`

- [ ] **Step 3: Write the implementation**

Append to `src/hedgefund/manual/advice.py`. Extend the imports at the top of the file:

```python
import logging
import uuid
from datetime import datetime, timedelta, timezone

from hedgefund.manual.market_data import (
    AssetQuote,
    MarketDataProvider,
    PricesUnavailableError,
    UnknownSymbolError,
)
from hedgefund.manual.signals import CoinSignal, PortfolioContext, coin_signal, portfolio_context
```

Add near the other constants:

```python
CACHE_TTL = timedelta(minutes=15)
# The candle range signals are computed over. 1W of hourly bars is enough to
# warm a 20-period SMA and a 14-period RSI with room to spare.
SIGNAL_RANGE = "1W"
LLM_MAX_TOKENS = 1024

_log = logging.getLogger(__name__)
```

Then append:

```python
def read_cached_advice(repo, portfolio_id: uuid.UUID, *, scope: str) -> dict | None:
    """Cached payload for this scope if it is still fresh, else None.

    Never calls the LLM. This is what GET /advice serves, which is why simply
    loading the Dashboard costs nothing.
    """
    row = repo.get_fresh_advice(
        portfolio_id, scope=scope, not_before=datetime.now(timezone.utc) - CACHE_TTL
    )
    return None if row is None else row.payload


def _gather_signals(
    market: MarketDataProvider, symbols: Sequence[str]
) -> list[CoinSignal]:
    """Signals for each symbol, skipping any the exchange cannot price.

    One bad symbol must not sink the whole advice request — the card degrades
    to fewer facts rather than erroring.
    """
    out: list[CoinSignal] = []
    for symbol in symbols:
        try:
            series = market.get_candles(symbol, SIGNAL_RANGE)
            out.append(coin_signal(symbol, series.candles))
        except (UnknownSymbolError, PricesUnavailableError, ValueError) as exc:
            _log.warning("advice: skipping %s (%s)", symbol, exc)
    return out


def generate_advice(
    repo, market: MarketDataProvider, call_llm, *, view, scope: str
) -> dict:
    """Produce (or reuse) an advice payload for `scope` and cache it.

    Returns the payload dict — never raises for LLM problems. `view` is a
    PortfolioViewData the caller has already loaded. Caller commits.
    """
    cached = read_cached_advice(repo, view.portfolio_id, scope=scope)
    if cached is not None:
        return cached

    snapshot = market.get_assets()
    quotes = snapshot.assets
    held = [p.symbol for p in view.positions]

    symbols = [scope] if scope != PORTFOLIO_SCOPE else select_symbols(
        held=held, quotes=quotes
    )
    signals = _gather_signals(market, symbols)
    context = portfolio_context(
        equity=view.equity,
        cash=view.cash,
        total_return_pct=view.total_return_pct,
        positions=[(p.symbol, p.market_value) for p in view.positions],
    )

    suggestions: list[Suggestion]
    source = "llm"
    try:
        raw, _cost = call_llm(
            [{"role": "user", "content": build_prompt(signals, context, scope=scope)}],
            max_tokens=LLM_MAX_TOKENS,
        )
        suggestions = parse_llm_advice(
            raw,
            known_symbols={q.symbol for q in quotes},
            cash=view.cash,
            holdings={p.symbol: p.market_value for p in view.positions},
        )
    except Exception as exc:  # noqa: BLE001 — any LLM failure degrades, never breaks
        _log.warning("advice: LLM unavailable, using template fallback (%s)", exc)
        suggestions = template_advice(signals, context)
        source = "template"

    payload = suggestions_to_payload(suggestions, source=source)
    repo.add_advice(view.portfolio_id, scope=scope, payload=payload)
    return payload
```

Note the `call_llm` invocation passes `max_tokens` as a keyword and omits `model`, so `call_llm`'s existing `model="claude-sonnet-4-6"` default applies.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/manual/ -q`
Expected: PASS — all signal + advice tests green

- [ ] **Step 5: Confirm moving the fixture broke nothing**

Run: `pytest -q`
Expected: PASS — the 184 baseline plus the new tests, with no failures in `tests/api/`

- [ ] **Step 6: Commit**

```bash
git add src/hedgefund/manual/advice.py tests/manual/test_advice.py tests/conftest.py tests/api/conftest.py
git commit -m "feat(advice): generation orchestration with cache reuse and template fallback"
```

---

## Task 6: Bust the advice cache when an order fills

**Files:**
- Modify: `src/hedgefund/manual/portfolio_service.py:76-97`
- Test: `tests/api/test_manual_portfolio_routes.py`

**Why:** advice grounded in "you hold no coins" is wrong the instant a buy fills. The spec calls for the cache to be busted on fill.

- [ ] **Step 1: Write the failing test**

Append to `tests/api/test_manual_portfolio_routes.py`:

```python
def test_placing_an_order_clears_cached_advice(client, session):
    from datetime import datetime, timezone

    from hedgefund.api.db.manual_repository import ManualRepository

    repo = ManualRepository(session)
    portfolio = repo.get_or_create_active_portfolio(100_000.0)
    repo.add_advice(portfolio.id, scope="portfolio", payload={"suggestions": []})
    session.commit()

    response = client.post(
        "/portfolio/orders", json={"symbol": "BTC", "side": "buy", "usd_amount": 100.0}
    )

    assert response.status_code == 201
    cutoff = datetime(2000, 1, 1, tzinfo=timezone.utc)
    assert repo.get_fresh_advice(portfolio.id, scope="portfolio", not_before=cutoff) is None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/api/test_manual_portfolio_routes.py -q -k clears_cached_advice`
Expected: FAIL — the final assertion fails; the advice row is still present.

- [ ] **Step 3: Write the implementation**

In `src/hedgefund/manual/portfolio_service.py`, change the tail of `place_order` from:

```python
    units = pm.units_for(usd_amount, quote.price)
    return repo.add_order(
        portfolio.id, symbol=symbol, side=side,
        usd_amount=usd_amount, units=units, fill_price=quote.price,
    )
```

to:

```python
    units = pm.units_for(usd_amount, quote.price)
    order = repo.add_order(
        portfolio.id, symbol=symbol, side=side,
        usd_amount=usd_amount, units=units, fill_price=quote.price,
    )
    # A fill changes holdings, cash, and concentration — every cached advice
    # payload for this portfolio now describes a portfolio that no longer
    # exists. Drop them all; the next explicit request regenerates.
    repo.clear_advice(portfolio.id)
    return order
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/api/test_manual_portfolio_routes.py -q`
Expected: PASS — all existing route tests plus the new one

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/manual/portfolio_service.py tests/api/test_manual_portfolio_routes.py
git commit -m "feat(advice): invalidate cached advice when an order fills"
```

---

## Task 7: Config flag for the advisor kill switch

**Files:**
- Modify: `src/hedgefund/api/config.py`
- Test: `tests/api/test_paper_config.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/api/test_paper_config.py`:

```python
def test_advisor_is_enabled_by_default(monkeypatch):
    from hedgefund.api.config import get_settings

    monkeypatch.delenv("MANUAL_ADVISOR_ENABLED", raising=False)
    get_settings.cache_clear()

    assert get_settings().advisor_enabled is True
    get_settings.cache_clear()


def test_advisor_can_be_disabled_by_env(monkeypatch):
    from hedgefund.api.config import get_settings

    monkeypatch.setenv("MANUAL_ADVISOR_ENABLED", "0")
    get_settings.cache_clear()

    assert get_settings().advisor_enabled is False
    get_settings.cache_clear()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/api/test_paper_config.py -q -k advisor`
Expected: FAIL — `AttributeError: 'Settings' object has no attribute 'advisor_enabled'`

- [ ] **Step 3: Write the implementation**

In `src/hedgefund/api/config.py`, add a parameter to `Settings.__init__` after `manual_equity_snapshot_seconds`:

```python
        advisor_enabled: bool = True,
```

and the matching assignment in the body:

```python
        self.advisor_enabled = advisor_enabled
```

Then in `get_settings()`, add:

```python
        advisor_enabled=os.environ.get("MANUAL_ADVISOR_ENABLED", "1") == "1",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/api/test_paper_config.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/config.py tests/api/test_paper_config.py
git commit -m "feat(advice): MANUAL_ADVISOR_ENABLED server kill switch"
```

---

## Task 8: Advice schemas and routes

**Files:**
- Modify: `src/hedgefund/api/manual_schemas.py`
- Create: `src/hedgefund/api/routes/advice.py`
- Modify: `src/hedgefund/api/app.py`
- Test: `tests/api/test_advice_routes.py`

**Route contract:**

| Route | Behavior |
|---|---|
| `GET /advice?symbol=` | Cache read only. `{advice: null}` when nothing fresh is cached. **Never calls the LLM.** |
| `POST /advice?symbol=` | Generate (reusing a fresh cache entry if present), 201 with the payload. |

Both return `enabled: false` with `advice: null` when `MANUAL_ADVISOR_ENABLED=0`, so the UI can decide what to render rather than facing a broken endpoint.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_advice_routes.py`:

```python
from __future__ import annotations

import json

import pytest

from hedgefund.api.deps import get_call_llm

_GOOD = json.dumps({"suggestions": [
    {"text": "Consider buying BTC", "why": "It looks oversold.",
     "action": {"side": "buy", "symbol": "BTC", "usd_amount": 100}},
]})


@pytest.fixture
def llm_ok(client):
    """Override the LLM dependency with a deterministic canned response.

    Yields the list of calls made, so tests can assert the LLM was (or was
    not) reached.
    """
    calls = []

    def fake(messages, model="m", max_tokens=1024):
        calls.append(messages)
        return _GOOD, 0.0

    client.app.dependency_overrides[get_call_llm] = lambda: fake
    yield calls
    client.app.dependency_overrides.pop(get_call_llm, None)


def test_get_advice_returns_null_when_nothing_is_cached(client, llm_ok):
    response = client.get("/advice")

    assert response.status_code == 200
    assert response.json()["advice"] is None
    assert response.json()["enabled"] is True


def test_get_advice_never_calls_the_llm(client, llm_ok):
    client.get("/advice")

    assert llm_ok == []


def test_post_advice_generates_and_returns_suggestions(client, llm_ok):
    response = client.post("/advice")

    assert response.status_code == 201
    body = response.json()["advice"]
    assert body["source"] == "llm"
    assert body["suggestions"][0]["text"] == "Consider buying BTC"
    assert body["disclaimer"]


def test_post_advice_calls_the_llm_exactly_once(client, llm_ok):
    client.post("/advice")

    assert len(llm_ok) == 1


def test_get_advice_serves_the_cache_written_by_post(client, llm_ok):
    client.post("/advice")

    response = client.get("/advice")

    assert response.json()["advice"]["suggestions"][0]["text"] == "Consider buying BTC"
    assert len(llm_ok) == 1  # still only the POST's call


def test_post_advice_reuses_a_fresh_cache_instead_of_calling_again(client, llm_ok):
    client.post("/advice")
    client.post("/advice")

    assert len(llm_ok) == 1


def test_post_advice_accepts_a_symbol_scope(client, llm_ok):
    response = client.post("/advice?symbol=BTC")

    assert response.status_code == 201
    assert response.json()["advice"]["suggestions"]


def test_symbol_scoped_advice_is_cached_separately_from_portfolio_advice(client, llm_ok):
    client.post("/advice")
    client.post("/advice?symbol=BTC")

    assert len(llm_ok) == 2


def test_post_advice_rejects_an_unknown_symbol(client, llm_ok):
    response = client.post("/advice?symbol=NOTACOIN")

    assert response.status_code == 404


def test_post_advice_falls_back_to_template_when_the_llm_fails(client):
    def boom(messages, model="m", max_tokens=1024):
        raise RuntimeError("down")

    client.app.dependency_overrides[get_call_llm] = lambda: boom
    try:
        response = client.post("/advice")
    finally:
        client.app.dependency_overrides.pop(get_call_llm, None)

    assert response.status_code == 201
    assert response.json()["advice"]["source"] == "template"
    assert response.json()["advice"]["suggestions"]


def test_advice_reports_disabled_when_the_kill_switch_is_off(client, llm_ok, monkeypatch):
    from hedgefund.api.config import get_settings

    monkeypatch.setenv("MANUAL_ADVISOR_ENABLED", "0")
    get_settings.cache_clear()
    try:
        get_response = client.get("/advice")
        post_response = client.post("/advice")
    finally:
        get_settings.cache_clear()

    assert get_response.json() == {"enabled": False, "advice": None}
    assert post_response.status_code == 200
    assert post_response.json() == {"enabled": False, "advice": None}
    assert llm_ok == []


def test_post_advice_returns_503_when_prices_are_unavailable(client, llm_ok, market_data):
    market_data.unavailable = True

    response = client.post("/advice")

    assert response.status_code == 503
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/api/test_advice_routes.py -q`
Expected: FAIL — every test 404s; the route does not exist.

- [ ] **Step 3: Add the schemas**

Append to `src/hedgefund/api/manual_schemas.py` (the file already imports `Literal` for `PlaceOrderRequest`):

```python
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
```

- [ ] **Step 4: Write the route module**

Create `src/hedgefund/api/routes/advice.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from hedgefund.api.config import get_settings
from hedgefund.api.db.engine import get_session
from hedgefund.api.db.manual_repository import ManualRepository
from hedgefund.api.deps import get_call_llm, get_market_data
from hedgefund.api.manual_schemas import AdvicePayloadOut, AdviceResponse
from hedgefund.manual import advice as adv
from hedgefund.manual.market_data import PricesUnavailableError, UnknownSymbolError
from hedgefund.manual.portfolio_service import DEFAULT_STARTING_CASH, get_portfolio_view

router = APIRouter(prefix="/advice", tags=["advice"])

_UNAVAILABLE_MSG = "Prices are temporarily unavailable — please try again shortly."


def _disabled() -> AdviceResponse:
    return AdviceResponse(enabled=False, advice=None)


def _scope_for(symbol: str | None, market) -> str:
    """Validate an optional ?symbol= and turn it into a cache scope."""
    if symbol is None:
        return adv.PORTFOLIO_SCOPE
    upper = symbol.upper()
    pair_for = getattr(market, "pair_for", None)
    if pair_for is not None:
        try:
            pair_for(upper)
        except UnknownSymbolError:
            raise HTTPException(status_code=404, detail="Unknown coin.")
    return upper


@router.get("", response_model=AdviceResponse)
def read_advice(
    symbol: str | None = Query(None),
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
) -> AdviceResponse:
    """Cached advice only — deliberately never calls the LLM, so simply opening
    the Dashboard costs nothing."""
    if not get_settings().advisor_enabled:
        return _disabled()

    scope = _scope_for(symbol, market)
    repo = ManualRepository(session)
    portfolio = repo.get_or_create_active_portfolio(DEFAULT_STARTING_CASH)
    session.commit()

    payload = adv.read_cached_advice(repo, portfolio.id, scope=scope)
    return AdviceResponse(
        enabled=True,
        advice=None if payload is None else AdvicePayloadOut.model_validate(payload),
    )


@router.post("", response_model=AdviceResponse, status_code=status.HTTP_201_CREATED)
def create_advice(
    response: Response,
    symbol: str | None = Query(None),
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
    call_llm=Depends(get_call_llm),
) -> AdviceResponse:
    """Generate advice on demand. Reuses a fresh cache entry if one exists."""
    if not get_settings().advisor_enabled:
        # Not an error: the client asked for something the operator turned off.
        response.status_code = status.HTTP_200_OK
        return _disabled()

    scope = _scope_for(symbol, market)
    repo = ManualRepository(session)
    try:
        view = get_portfolio_view(repo, market)
        payload = adv.generate_advice(repo, market, call_llm, view=view, scope=scope)
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    except UnknownSymbolError:
        raise HTTPException(status_code=404, detail="Unknown coin.")
    session.commit()
    return AdviceResponse(enabled=True, advice=AdvicePayloadOut.model_validate(payload))
```

**Note on `_scope_for` and the test fake:** `MarketDataCache` has `pair_for`, but `FakeMarketData` does not. The `getattr` guard means the fake skips pair validation and the unknown symbol instead surfaces from `get_candles` inside `_gather_signals`. That path logs and skips, which would let `POST /advice?symbol=NOTACOIN` return 200 instead of the 404 the test expects. **Add `pair_for` to the fake** so both paths validate identically — in `tests/fixtures/market.py`, add to `FakeMarketData`:

```python
    def pair_for(self, symbol: str) -> str:
        if symbol not in {q.symbol for q in self.quotes}:
            raise UnknownSymbolError(symbol)
        return f"{symbol}/USDT"
```

- [ ] **Step 5: Register the router**

In `src/hedgefund/api/app.py`, add the import beside the others:

```python
from hedgefund.api.routes.advice import router as advice_router
```

and register it after `watchlist_router`:

```python
    app.include_router(advice_router)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pytest tests/api/test_advice_routes.py -q`
Expected: PASS — 12 passed

- [ ] **Step 7: Run the whole backend suite**

Run: `pytest -q`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add src/hedgefund/api/manual_schemas.py src/hedgefund/api/routes/advice.py src/hedgefund/api/app.py tests/api/test_advice_routes.py tests/fixtures/market.py
git commit -m "feat(advice): GET/POST /advice with cache-only reads and on-demand generation"
```

---

## Task 9: Frontend types and API client

**Files:**
- Modify: `dashboard/src/types.ts`
- Create: `dashboard/src/api/advice.ts`
- Test: `dashboard/src/api/advice.test.ts`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/api/advice.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateAdvice, getAdvice } from './advice'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(body: unknown) {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

const PAYLOAD = {
  enabled: true,
  advice: {
    suggestions: [{ text: 'Buy BTC', why: 'Oversold', action: null }],
    disclaimer: 'Simulated learning advice — not financial advice.',
    source: 'llm',
  },
}

describe('getAdvice', () => {
  it('requests the portfolio scope when no symbol is given', async () => {
    const spy = stubFetch(PAYLOAD)

    await getAdvice()

    expect(spy.mock.calls[0][0]).toMatch(/\/advice$/)
  })

  it('appends the symbol query when one is given', async () => {
    const spy = stubFetch(PAYLOAD)

    await getAdvice('BTC')

    expect(spy.mock.calls[0][0]).toMatch(/\/advice\?symbol=BTC$/)
  })

  it('returns the parsed body', async () => {
    stubFetch(PAYLOAD)

    const result = await getAdvice()

    expect(result.advice?.suggestions[0].text).toBe('Buy BTC')
  })
})

describe('generateAdvice', () => {
  it('POSTs to the advice endpoint', async () => {
    const spy = stubFetch(PAYLOAD)

    await generateAdvice()

    expect(spy.mock.calls[0][1]?.method).toBe('POST')
  })

  it('appends the symbol query when one is given', async () => {
    const spy = stubFetch(PAYLOAD)

    await generateAdvice('ETH')

    expect(spy.mock.calls[0][0]).toMatch(/\/advice\?symbol=ETH$/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/api/advice.test.ts`
Expected: FAIL — cannot resolve `./advice`

- [ ] **Step 3: Add the types**

Append to `dashboard/src/types.ts`:

```ts
// ---- Advisor (Phase 4) ----

export interface SuggestionAction {
  side: 'buy' | 'sell'
  symbol: string
  usd_amount: number
}

export interface AdviceSuggestion {
  text: string
  why: string
  action: SuggestionAction | null
}

export interface AdvicePayload {
  suggestions: AdviceSuggestion[]
  disclaimer: string
  source: 'llm' | 'template'
}

export interface AdviceResponse {
  enabled: boolean
  advice: AdvicePayload | null
}
```

- [ ] **Step 4: Write the API client**

Create `dashboard/src/api/advice.ts`:

```ts
import { apiFetch } from './client'
import type { AdviceResponse } from '../types'

function path(symbol?: string): string {
  return symbol ? `/advice?symbol=${encodeURIComponent(symbol)}` : '/advice'
}

/** Cached advice only — this call never triggers an LLM request server-side. */
export function getAdvice(symbol?: string): Promise<AdviceResponse> {
  return apiFetch<AdviceResponse>(path(symbol))
}

/** Generate advice on demand. Reuses a fresh server-side cache entry if present. */
export function generateAdvice(symbol?: string): Promise<AdviceResponse> {
  return apiFetch<AdviceResponse>(path(symbol), { method: 'POST' })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/api/advice.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/types.ts dashboard/src/api/advice.ts dashboard/src/api/advice.test.ts
git commit -m "feat(advice): frontend advice types and API client"
```

---

## Task 10: Shared `usePlaceOrder` hook

**Files:**
- Create: `dashboard/src/hooks/usePlaceOrder.ts`
- Modify: `dashboard/src/components/OrderTicket.tsx`
- Test: `dashboard/src/hooks/usePlaceOrder.test.tsx`

**Why:** `AdvisorCard`'s one-tap accept needs exactly the behavior `OrderTicket` already has — place the order, invalidate `['portfolio']`, toast with a Portfolio action. Copying that into a second component would guarantee drift. Extract once, use twice. The hook must additionally invalidate `['advice']`, because the server drops cached advice on every fill (Task 6) and a stale card would otherwise keep describing a portfolio that no longer exists.

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/hooks/usePlaceOrder.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlaceOrder } from './usePlaceOrder'

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))

const toastSuccess = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a) } }))

const placeOrder = vi.fn()
vi.mock('../api/portfolio', () => ({ placeOrder: (b: unknown) => placeOrder(b) }))

const ORDER = {
  id: '1', symbol: 'BTC', side: 'buy' as const, usd_amount: 100,
  units: 0.5, fill_price: 200, created_at: '2026-08-08T00:00:00Z',
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('usePlaceOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    placeOrder.mockResolvedValue(ORDER)
  })

  it('calls placeOrder with exactly the request body', async () => {
    const { result } = renderHook(() => usePlaceOrder(), {
      wrapper: wrapper(new QueryClient()),
    })

    await act(async () => {
      result.current.mutate({ symbol: 'BTC', side: 'buy', usd_amount: 100 })
    })

    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith({ symbol: 'BTC', side: 'buy', usd_amount: 100 }),
    )
  })

  it('toasts on success', async () => {
    const { result } = renderHook(() => usePlaceOrder(), {
      wrapper: wrapper(new QueryClient()),
    })

    await act(async () => {
      result.current.mutate({ symbol: 'BTC', side: 'buy', usd_amount: 100 })
    })

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(toastSuccess.mock.calls[0][0]).toContain('Bought')
  })

  it('invalidates both the portfolio and the advice caches', async () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => usePlaceOrder(), { wrapper: wrapper(client) })

    await act(async () => {
      result.current.mutate({ symbol: 'BTC', side: 'buy', usd_amount: 100 })
    })

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['portfolio'] }))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['advice'] })
  })

  it('runs the caller-supplied onSuccess callback', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() => usePlaceOrder({ onSuccess }), {
      wrapper: wrapper(new QueryClient()),
    })

    await act(async () => {
      result.current.mutate({ symbol: 'BTC', side: 'buy', usd_amount: 100 })
    })

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(ORDER))
  })

  it('runs the caller-supplied onError callback', async () => {
    placeOrder.mockRejectedValue(new Error('Not enough buying power'))
    const onError = vi.fn()
    const { result } = renderHook(() => usePlaceOrder({ onError }), {
      wrapper: wrapper(new QueryClient()),
    })

    await act(async () => {
      result.current.mutate({ symbol: 'BTC', side: 'buy', usd_amount: 100 })
    })

    await waitFor(() => expect(onError).toHaveBeenCalled())
    expect(onError.mock.calls[0][0].message).toBe('Not enough buying power')
  })

  it('says Sold for a sell order', async () => {
    placeOrder.mockResolvedValue({ ...ORDER, side: 'sell' })
    const { result } = renderHook(() => usePlaceOrder(), {
      wrapper: wrapper(new QueryClient()),
    })

    await act(async () => {
      result.current.mutate({ symbol: 'BTC', side: 'sell', usd_amount: 100 })
    })

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(toastSuccess.mock.calls[0][0]).toContain('Sold')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/hooks/usePlaceOrder.test.tsx`
Expected: FAIL — cannot resolve `./usePlaceOrder`

- [ ] **Step 3: Write the hook**

Create `dashboard/src/hooks/usePlaceOrder.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { placeOrder } from '../api/portfolio'
import { formatUsd } from '../lib/format'
import type { ManualOrder, PlaceOrderRequest } from '../types'

type Options = {
  onSuccess?: (order: ManualOrder) => void
  onError?: (error: Error) => void
}

/**
 * The single place an order gets placed from the UI.
 *
 * Both the order ticket and the advisor's one-tap accept route through here so
 * the toast copy, the Portfolio deep link, and the cache invalidation cannot
 * drift apart. `['advice']` is invalidated alongside `['portfolio']` because
 * the server drops cached advice on every fill.
 */
export function usePlaceOrder(options: Options = {}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    // Wrapped rather than passed by reference: react-query v5 calls
    // mutationFn(variables, context), and that extra arg leaks into assertions.
    mutationFn: (body: PlaceOrderRequest) => placeOrder(body),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      queryClient.invalidateQueries({ queryKey: ['advice'] })
      const verb = order.side === 'buy' ? 'Bought' : 'Sold'
      toast.success(`${verb} ${formatUsd(order.usd_amount)} of ${order.symbol} ✓`, {
        action: { label: 'Portfolio', onClick: () => navigate('/portfolio') },
      })
      options.onSuccess?.(order)
    },
    onError: (error: Error) => {
      options.onError?.(error)
    },
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/hooks/usePlaceOrder.test.tsx`
Expected: PASS — 6 passed

- [ ] **Step 5: Refactor OrderTicket onto the hook**

In `dashboard/src/components/OrderTicket.tsx`:

Remove these imports:

```ts
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { placeOrder } from '../api/portfolio'
```

Add:

```ts
import { usePlaceOrder } from '../hooks/usePlaceOrder'
```

Remove these two lines from the component body:

```ts
  const queryClient = useQueryClient()
  const navigate = useNavigate()
```

Replace the whole `const mutation = useMutation({...})` block with:

```ts
  const mutation = usePlaceOrder({
    onSuccess: () => {
      setIsReviewOpen(false)
      setAmount('')
      setServerError(null)
    },
    onError: (error) => {
      setIsReviewOpen(false)
      setServerError(error.message)
    },
  })
```

If TypeScript now reports `PlaceOrderRequest` as an unused import in this file, drop it from the type import.

- [ ] **Step 6: Verify the refactor changed no behavior**

Run: `cd dashboard && npx vitest run src/components/OrderTicket.test.tsx`
Expected: PASS — every existing OrderTicket test still green, **unmodified**

If an OrderTicket test fails, the refactor changed behavior. Fix the hook, not the test.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/hooks/usePlaceOrder.ts dashboard/src/hooks/usePlaceOrder.test.tsx dashboard/src/components/OrderTicket.tsx
git commit -m "refactor(orders): extract usePlaceOrder and route OrderTicket through it"
```

---

## Task 11: AdvisorCard component

**Files:**
- Create: `dashboard/src/components/AdvisorCard.tsx`
- Test: `dashboard/src/components/AdvisorCard.test.tsx`

**Behavior:**
- Mounts showing cached advice if the server has some, otherwise an empty state with a **Get advice** button.
- Clicking generates (POST). The button shows a pending state and is disabled while in flight.
- Each suggestion shows `text`, a **Why?** disclosure revealing `why`, and — only when `action` is present — a one-tap button that opens a Review dialog before filling. **Never fills without the dialog**; that is the spec's cross-cutting rule (§8) and Phase 3's established pattern.
- Always renders the disclaimer.
- Renders a "template" note when `source === 'template'` so the user knows the LLM did not author it.
- Renders nothing at all when disabled.

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/components/AdvisorCard.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdvisorCard } from './AdvisorCard'

const getAdvice = vi.fn()
const generateAdvice = vi.fn()
vi.mock('../api/advice', () => ({
  getAdvice: (s?: string) => getAdvice(s),
  generateAdvice: (s?: string) => generateAdvice(s),
}))

const mutate = vi.fn()
vi.mock('../hooks/usePlaceOrder', () => ({
  usePlaceOrder: () => ({ mutate, isPending: false }),
}))

const SUGGESTION = { text: 'Consider buying BTC', why: 'Its RSI is 22.', action: null }
const WITH_ACTION = {
  text: 'Buy $100 of BTC',
  why: 'Oversold.',
  action: { side: 'buy' as const, symbol: 'BTC', usd_amount: 100 },
}

function payload(suggestions: unknown[], source = 'llm') {
  return {
    enabled: true,
    advice: {
      suggestions,
      disclaimer: 'Simulated learning advice — not financial advice.',
      source,
    },
  }
}

function renderCard(props: { symbol?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AdvisorCard {...props} />
    </QueryClientProvider>,
  )
}

describe('AdvisorCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    getAdvice.mockResolvedValue({ enabled: true, advice: null })
    generateAdvice.mockResolvedValue(payload([SUGGESTION]))
  })

  it('shows a Get advice button when nothing is cached', async () => {
    renderCard()

    expect(await screen.findByRole('button', { name: /get advice/i })).toBeInTheDocument()
  })

  it('does not generate advice on mount', async () => {
    renderCard()

    await screen.findByRole('button', { name: /get advice/i })
    expect(generateAdvice).not.toHaveBeenCalled()
  })

  it('renders cached advice without needing a click', async () => {
    getAdvice.mockResolvedValue(payload([SUGGESTION]))

    renderCard()

    expect(await screen.findByText('Consider buying BTC')).toBeInTheDocument()
  })

  it('generates advice when the button is clicked', async () => {
    renderCard()

    await userEvent.click(await screen.findByRole('button', { name: /get advice/i }))

    await waitFor(() => expect(generateAdvice).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Consider buying BTC')).toBeInTheDocument()
  })

  it('passes the symbol through when scoped to a coin', async () => {
    renderCard({ symbol: 'ETH' })

    await userEvent.click(await screen.findByRole('button', { name: /get advice/i }))

    await waitFor(() => expect(generateAdvice).toHaveBeenCalledWith('ETH'))
  })

  it('always renders the disclaimer alongside advice', async () => {
    getAdvice.mockResolvedValue(payload([SUGGESTION]))

    renderCard()

    expect(await screen.findByText(/not financial advice/i)).toBeInTheDocument()
  })

  it('reveals the reasoning when Why is expanded', async () => {
    getAdvice.mockResolvedValue(payload([SUGGESTION]))
    renderCard()

    await userEvent.click(await screen.findByRole('button', { name: /why/i }))

    expect(screen.getByText('Its RSI is 22.')).toBeInTheDocument()
  })

  it('notes when the text came from the template fallback', async () => {
    getAdvice.mockResolvedValue(payload([SUGGESTION], 'template'))

    renderCard()

    expect(await screen.findByText(/generated without the ai/i)).toBeInTheDocument()
  })

  it('shows no trade button for a suggestion with no action', async () => {
    getAdvice.mockResolvedValue(payload([SUGGESTION]))

    renderCard()

    await screen.findByText('Consider buying BTC')
    expect(screen.queryByRole('button', { name: /^buy \$/i })).not.toBeInTheDocument()
  })

  it('shows a one-tap trade button when the suggestion carries an action', async () => {
    getAdvice.mockResolvedValue(payload([WITH_ACTION]))

    renderCard()

    expect(
      await screen.findByRole('button', { name: /buy \$100\.00 of BTC/i }),
    ).toBeInTheDocument()
  })

  it('opens a review dialog instead of filling immediately', async () => {
    getAdvice.mockResolvedValue(payload([WITH_ACTION]))
    renderCard()

    await userEvent.click(await screen.findByRole('button', { name: /buy \$100\.00 of BTC/i }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('places the order only after the dialog is confirmed', async () => {
    getAdvice.mockResolvedValue(payload([WITH_ACTION]))
    renderCard()

    await userEvent.click(await screen.findByRole('button', { name: /buy \$100\.00 of BTC/i }))
    await userEvent.click(await screen.findByRole('button', { name: /confirm buy/i }))

    expect(mutate).toHaveBeenCalledWith({ symbol: 'BTC', side: 'buy', usd_amount: 100 })
  })

  it('renders nothing when the advisor is disabled server-side', async () => {
    getAdvice.mockResolvedValue({ enabled: false, advice: null })

    const { container } = renderCard()

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('offers a retry when generation fails', async () => {
    generateAdvice.mockRejectedValue(new Error('boom'))
    renderCard()

    await userEvent.click(await screen.findByRole('button', { name: /get advice/i }))

    expect(await screen.findByText(/couldn't generate advice/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/components/AdvisorCard.test.tsx`
Expected: FAIL — cannot resolve `./AdvisorCard`

- [ ] **Step 3: Write the component**

Create `dashboard/src/components/AdvisorCard.tsx`:

```tsx
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { generateAdvice, getAdvice } from '../api/advice'
import { usePlaceOrder } from '../hooks/usePlaceOrder'
import { formatUsd } from '../lib/format'
import type { AdviceResponse, SuggestionAction } from '../types'

type Props = {
  /** Omit for portfolio-wide advice; pass a base symbol for per-coin advice. */
  symbol?: string
}

export function AdvisorCard({ symbol }: Props) {
  const [pendingAction, setPendingAction] = useState<SuggestionAction | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const queryKey = ['advice', symbol ?? 'portfolio']
  const cached = useQuery({ queryKey, queryFn: () => getAdvice(symbol) })

  const generate = useMutation({
    mutationFn: () => generateAdvice(symbol),
    onSuccess: (data: AdviceResponse) => queryClient.setQueryData(queryKey, data),
  })

  const placeOrder = usePlaceOrder({ onSuccess: () => setPendingAction(null) })

  if (cached.isLoading) return <Skeleton className="h-40 rounded-xl" />
  // A disabled advisor renders nothing at all rather than an explanatory box —
  // the kill switch exists to remove the surface, not to advertise it.
  if (cached.data?.enabled === false) return null

  const advice = cached.data?.advice ?? null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          Advisor{symbol ? `'s take on ${symbol}` : ''}
        </CardTitle>
        {advice && (
          <Button
            variant="ghost"
            size="sm"
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? 'Thinking…' : 'Refresh'}
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {!advice && !generate.isError && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Get plain-English suggestions based on your portfolio and current signals.
            </p>
            <Button
              size="sm"
              disabled={generate.isPending}
              onClick={() => generate.mutate()}
              className="transition-transform duration-200 active:scale-[0.98]"
            >
              {generate.isPending ? 'Thinking…' : 'Get advice'}
            </Button>
          </div>
        )}

        {generate.isError && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              We couldn't generate advice just now.
            </p>
            <Button variant="outline" size="sm" onClick={() => generate.mutate()}>
              Try again
            </Button>
          </div>
        )}

        {advice?.suggestions.map((suggestion, index) => (
          <div
            key={index}
            className="flex flex-col gap-1.5 border-t border-border pt-3 first:border-0 first:pt-0"
          >
            <p className="text-sm">{suggestion.text}</p>

            <button
              type="button"
              onClick={() => setExpanded(expanded === index ? null : index)}
              aria-expanded={expanded === index}
              className="self-start text-xs text-primary transition-colors duration-200 hover:underline"
            >
              Why?
            </button>
            {expanded === index && (
              <p className="text-xs text-muted-foreground">{suggestion.why}</p>
            )}

            {suggestion.action && (
              <Button
                size="sm"
                onClick={() => setPendingAction(suggestion.action)}
                className={cn(
                  'mt-1 self-start transition-transform duration-200 active:scale-[0.98]',
                  suggestion.action.side === 'buy'
                    ? 'bg-profit text-white hover:bg-profit/90'
                    : 'bg-loss text-white hover:bg-loss/90',
                )}
              >
                <span className="capitalize">{suggestion.action.side}</span>{' '}
                {formatUsd(suggestion.action.usd_amount)} of {suggestion.action.symbol}
              </Button>
            )}
          </div>
        ))}

        {advice?.source === 'template' && (
          <p className="text-xs text-muted-foreground/70">
            Generated without the AI — showing signal-based guidance instead.
          </p>
        )}

        {advice && (
          <p className="border-t border-border pt-2 text-xs text-muted-foreground/70">
            {advice.disclaimer}
          </p>
        )}
      </CardContent>

      <Dialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {pendingAction?.side} {formatUsd(pendingAction?.usd_amount ?? 0)} of{' '}
              {pendingAction?.symbol}
            </DialogTitle>
            <DialogDescription>
              Market order, filled at the latest cached price. This is simulated money.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
            <Button
              disabled={placeOrder.isPending}
              onClick={() =>
                pendingAction &&
                placeOrder.mutate({
                  symbol: pendingAction.symbol,
                  side: pendingAction.side,
                  usd_amount: pendingAction.usd_amount,
                })
              }
              className={cn(
                pendingAction?.side === 'buy'
                  ? 'bg-profit text-white hover:bg-profit/90'
                  : 'bg-loss text-white hover:bg-loss/90',
              )}
            >
              Confirm {pendingAction?.side}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/components/AdvisorCard.test.tsx`
Expected: PASS — 14 passed

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/AdvisorCard.tsx dashboard/src/components/AdvisorCard.test.tsx
git commit -m "feat(advice): AdvisorCard with on-demand generation and reviewed one-tap trades"
```

---

## Task 12: Mount the AdvisorCard on the Dashboard

**Files:**
- Modify: `dashboard/src/pages/DashboardPage.tsx:146-181`
- Test: `dashboard/src/pages/DashboardPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add an `../api/advice` mock beside the existing API mocks at the top of `dashboard/src/pages/DashboardPage.test.tsx`:

```tsx
vi.mock('../api/advice', () => ({
  getAdvice: () => Promise.resolve({ enabled: true, advice: null }),
  generateAdvice: () => Promise.resolve({ enabled: true, advice: null }),
}))
```

Then append inside the existing top-level `describe`:

```tsx
  it('renders the advisor card', async () => {
    renderPage()

    expect(await screen.findByText(/^Advisor$/)).toBeInTheDocument()
  })
```

`AdvisorCard` calls `usePlaceOrder`, which calls `useNavigate`. If the existing `renderPage` helper does not already wrap in a `MemoryRouter`, wrap it — otherwise this throws rather than failing on the assertion.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: FAIL — `Unable to find an element with the text: /^Advisor$/`

- [ ] **Step 3: Write the implementation**

In `dashboard/src/pages/DashboardPage.tsx`, add the import:

```tsx
import { AdvisorCard } from '../components/AdvisorCard'
```

Insert the card as the **first** element of the right-hand column, above Watchlist, so the advisor is the most prominent thing in that column. Change:

```tsx
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Watchlist</CardTitle>
            </CardHeader>
```

to:

```tsx
        <div className="flex flex-col gap-6">
          <AdvisorCard />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Watchlist</CardTitle>
            </CardHeader>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/DashboardPage.tsx dashboard/src/pages/DashboardPage.test.tsx
git commit -m "feat(advice): mount the advisor card on the dashboard"
```

---

## Task 13: Mount the per-coin AdvisorCard on the Trade view

**Files:**
- Modify: `dashboard/src/pages/AssetPage.tsx`
- Test: `dashboard/src/pages/AssetPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add the advice mock beside the existing API mocks at the top of `dashboard/src/pages/AssetPage.test.tsx`:

```tsx
vi.mock('../api/advice', () => ({
  getAdvice: () => Promise.resolve({ enabled: true, advice: null }),
  generateAdvice: () => Promise.resolve({ enabled: true, advice: null }),
}))
```

Then append inside the existing top-level `describe`:

```tsx
  it('renders an advisor card scoped to this coin', async () => {
    renderPage()

    expect(await screen.findByText(/Advisor's take on BTC/)).toBeInTheDocument()
  })
```

Change `BTC` if the file's existing `renderPage` helper routes to a different symbol.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/pages/AssetPage.test.tsx`
Expected: FAIL — text not found

- [ ] **Step 3: Write the implementation**

In `dashboard/src/pages/AssetPage.tsx`, add the import:

```tsx
import { AdvisorCard } from '../components/AdvisorCard'
```

Place it directly beneath the `<OrderTicket ... />` in the right-hand column (around line 223) so the advisor's take sits next to the ticket it feeds:

```tsx
          <AdvisorCard symbol={symbol} />
```

`symbol` is already in scope from `useParams` in this page. If the ticket's parent element is not a flex column with a gap, wrap both:

```tsx
          <div className="flex flex-col gap-6">
            {/* existing OrderTicket */}
            <AdvisorCard symbol={symbol} />
          </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/pages/AssetPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/AssetPage.tsx dashboard/src/pages/AssetPage.test.tsx
git commit -m "feat(advice): per-coin advisor card on the trade view"
```

---

## Task 14: Minimal Settings page with the advisor toggle

**Files:**
- Create: `dashboard/src/hooks/useAdvisorEnabled.ts`
- Create: `dashboard/src/pages/SettingsPage.tsx`
- Modify: `dashboard/src/App.tsx:50-59`
- Modify: `dashboard/src/components/AdvisorCard.tsx`
- Test: `dashboard/src/pages/SettingsPage.test.tsx`

**Scope:** this phase's Settings page contains **only** the advisor toggle. Phase 5 adds reset-portfolio and starting-cash to this same file. Do not build those now.

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/pages/SettingsPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { SettingsPage } from './SettingsPage'

describe('SettingsPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders a heading', () => {
    render(<SettingsPage />)

    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument()
  })

  it('shows the advisor toggle switched on by default', () => {
    render(<SettingsPage />)

    expect(screen.getByRole('switch', { name: /ai advisor/i })).toBeChecked()
  })

  it('turns the advisor off when toggled', async () => {
    render(<SettingsPage />)

    await userEvent.click(screen.getByRole('switch', { name: /ai advisor/i }))

    expect(screen.getByRole('switch', { name: /ai advisor/i })).not.toBeChecked()
  })

  it('persists the preference to localStorage', async () => {
    render(<SettingsPage />)

    await userEvent.click(screen.getByRole('switch', { name: /ai advisor/i }))

    expect(window.localStorage.getItem('hedgefund.advisorEnabled')).toBe('false')
  })

  it('reads a previously saved preference on mount', () => {
    window.localStorage.setItem('hedgefund.advisorEnabled', 'false')

    render(<SettingsPage />)

    expect(screen.getByRole('switch', { name: /ai advisor/i })).not.toBeChecked()
  })
})
```

Add one case to `dashboard/src/components/AdvisorCard.test.tsx`:

```tsx
  it('renders nothing when the user has switched the advisor off', async () => {
    window.localStorage.setItem('hedgefund.advisorEnabled', 'false')
    getAdvice.mockResolvedValue(payload([SUGGESTION]))

    const { container } = renderCard()

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
```

(The `beforeEach` in that file already clears localStorage, so this case cannot leak into the others.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dashboard && npx vitest run src/pages/SettingsPage.test.tsx`
Expected: FAIL — cannot resolve `./SettingsPage`

- [ ] **Step 3: Write the preference hook**

Create `dashboard/src/hooks/useAdvisorEnabled.ts`:

```ts
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'hedgefund.advisorEnabled'

// A module-level subscriber set: localStorage does not fire a 'storage' event
// in the tab that wrote it, so components in this tab need an explicit nudge
// to re-read. The window listener covers other tabs.
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function getSnapshot(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) !== 'false'
}

export function setAdvisorEnabled(enabled: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, String(enabled))
  listeners.forEach((listener) => listener())
}

/**
 * User-facing advisor preference, persisted in localStorage.
 *
 * A display preference only. MANUAL_ADVISOR_ENABLED on the server is the real
 * kill switch — this cannot cause LLM spend on its own, since advice is
 * generated only by an explicit click.
 */
export function useAdvisorEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
```

- [ ] **Step 4: Write the Settings page**

Create `dashboard/src/pages/SettingsPage.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { setAdvisorEnabled, useAdvisorEnabled } from '../hooks/useAdvisorEnabled'

export function SettingsPage() {
  const advisorEnabled = useAdvisorEnabled()

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Advisor</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center justify-between gap-6">
            <span>
              <span className="block text-sm font-medium">AI Advisor</span>
              <span className="block text-xs text-muted-foreground">
                Show suggestion cards on the Dashboard and coin pages. Suggestions are
                only generated when you ask for them.
              </span>
            </span>
            <Switch
              aria-label="AI Advisor"
              checked={advisorEnabled}
              onCheckedChange={setAdvisorEnabled}
            />
          </label>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Honour the preference in AdvisorCard**

In `dashboard/src/components/AdvisorCard.tsx`, add the import:

```tsx
import { useAdvisorEnabled } from '../hooks/useAdvisorEnabled'
```

Add the hook call at the top of the component, **before** any early return — every hook must run on every render:

```tsx
  const userEnabled = useAdvisorEnabled()
```

Then extend the existing disabled check:

```tsx
  if (cached.isLoading) return <Skeleton className="h-40 rounded-xl" />
  if (!userEnabled || cached.data?.enabled === false) return null
```

The `useQuery` still runs when the user has toggled the card off. That is intentional and cheap — `GET /advice` is a cache read that never calls the LLM.

- [ ] **Step 6: Wire the route**

In `dashboard/src/App.tsx`, add the import:

```tsx
import { SettingsPage } from './pages/SettingsPage'
```

Replace the `/settings` `ComingSoon` route (lines 50-59) with:

```tsx
        <Route path="/settings" element={<SettingsPage />} />
```

Remove `Settings` from the `lucide-react` import in that file **only if** it is now unused. `Newspaper` and `Trophy` are still used by the remaining `ComingSoon` routes — leave those.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd dashboard && npx vitest run src/pages/SettingsPage.test.tsx src/components/AdvisorCard.test.tsx`
Expected: PASS

- [ ] **Step 8: Run the whole frontend suite and build**

Run: `cd dashboard && npm test`
Expected: PASS, no regressions

Run: `cd dashboard && npm run build`
Expected: clean build, no TypeScript errors

- [ ] **Step 9: Commit**

```bash
git add dashboard/src/hooks/useAdvisorEnabled.ts dashboard/src/pages/SettingsPage.tsx dashboard/src/pages/SettingsPage.test.tsx dashboard/src/components/AdvisorCard.tsx dashboard/src/components/AdvisorCard.test.tsx dashboard/src/App.tsx
git commit -m "feat(advice): settings page with the advisor toggle"
```

---

## Task 15: Manual smoke check

**No code changes unless something is broken.** Skip the fix commit if everything passes.

- [ ] **Step 1: Confirm both suites and the build are green**

```bash
pytest -q
cd dashboard && npm test && npm run build
```

- [ ] **Step 2: Apply the migration and start both servers**

```bash
alembic upgrade head
uvicorn hedgefund.api.app:app --reload --port 8000
# separate terminal
cd dashboard && npm run dev
```

A real `ANTHROPIC_API_KEY` in `.env` is needed to exercise the LLM path. Without one every generation falls back to templates — itself worth verifying, but do both if you can.

- [ ] **Step 3: Walk the checklist**

- [ ] Dashboard shows the Advisor card with a **Get advice** button and no suggestions.
- [ ] Open DevTools → Network. Reload the Dashboard. Confirm `GET /advice` fires and **no** `POST /advice` fires. This is the cost guarantee — verify it, do not assume it.
- [ ] Click **Get advice**. Button shows "Thinking…", then 2-3 suggestions render with a disclaimer.
- [ ] Click **Why?** on a suggestion — the reasoning expands; clicking again collapses it.
- [ ] Reload the page. Suggestions still render (served from cache) and **no** `POST /advice` fires.
- [ ] If a suggestion carries a trade button, click it: a Review dialog opens and **no order is placed yet**. Cancel — nothing happens. Click again, Confirm — the order fills, a toast appears, stat cards update.
- [ ] After that fill, the advisor card's suggestions are cleared (cache busted) and **Get advice** is back.
- [ ] Open a coin page (`/coins/BTC`). "Advisor's take on BTC" renders with its own button, independent of the Dashboard card.
- [ ] Go to `/settings`. Toggle **AI Advisor** off. Return to the Dashboard — the card is gone. Toggle back on — it returns.
- [ ] Stop the backend, restart with `MANUAL_ADVISOR_ENABLED=0 uvicorn ...`. The card renders nowhere, on any page.
- [ ] Restart normally. Set an invalid `ANTHROPIC_API_KEY`, click **Get advice**: suggestions still render, with the "Generated without the AI" note. **The card must never show an error state for an LLM failure.**
- [ ] `/lab/backtests`, `/lab/research`, `/lab/paper` all still load and work.

- [ ] **Step 4: Fix anything broken, then re-run both suites**

If you changed code:

```bash
pytest -q && cd dashboard && npm test && npm run build
git add -A && git commit -m "fix(advice): phase 4 smoke-check fixes"
```

*(Skip if clean.)*

---

## Exit criteria

Phase 4 is done when all of these hold:

1. `GET /advice` never triggers an LLM call — verified in the Network tab, not just in tests.
2. The Advisor card renders on the Dashboard and on every coin page, with a working Why disclosure and disclaimer.
3. An LLM failure produces template text, never an error state.
4. One-tap accept always goes through a Review dialog before filling.
5. The advice cache is dropped whenever an order fills.
6. Both the server kill switch and the Settings toggle remove the card.
7. Backend and frontend suites green; production build clean.
8. Every `/lab/*` page still works.

---

## Self-review notes

**Spec coverage.** §7's advisor pipeline: signals (Task 2), portfolio context (Task 2), LLM summarization (Tasks 3-5), `advice_log` cache with 15-min TTL busted on fill (Tasks 1, 5, 6), template fallback (Tasks 3, 5). §5's "Advisor's take" card on the Trade view: Task 13. §5's Dashboard advisor card: Task 12. §3's disclaimer requirement: enforced in `suggestions_to_payload`, asserted in Tasks 5 and 11.

**Deliberate deviations from the spec, all approved above.** (a) Advice is on-demand rather than auto-fetched — spec §7 implies the card populates itself. (b) The advisor on/off control ships here rather than in Phase 5. (c) Limit orders, which spec §5 attaches to Pro view, are cut entirely and appear in neither phase.

**Known gap carried forward.** The vendored shadcn `dialog.tsx` emits a React dev-only `forwardRef` warning when a dialog first opens (documented during Phase 3). `AdvisorCard` adds a second consumer of that primitive, so the warning appears here too. It is dev-only and stripped from production builds. Fix — whenever someone picks it up — by re-running `npx shadcn add dialog --overwrite`.
