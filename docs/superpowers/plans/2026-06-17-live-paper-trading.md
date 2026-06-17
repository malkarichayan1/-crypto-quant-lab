# Live Paper Trading (Surface D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a `StrategySpec` forward against live exchange data with simulated money — hourly ticks, restart backfill, multiple concurrent sessions — reusing the existing backtest engine for each forward step.

**Architecture:** A new `src/hedgefund/paper/` package holds a resumable `PaperState`, a pure `step()` that advances one session by one candle (reusing `engine/indicators`, `engine/weights`, `engine/orders`, `engine/portfolio`), a shared in-process async `ticker` that catches every active session up to the latest closed candle, and a `service` for lifecycle. Three new tables persist sessions/trades/equity. SSE streaming reuses the existing `api/events.py` queue bus. The React dashboard gains a Paper Trading surface mirroring the existing Research surface.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2.0 (sync), Alembic, pandas, ccxt, pytest/pytest-asyncio; React + TypeScript + Vite + TanStack Query + React Router + Vitest; native `EventSource` for SSE.

---

## Reference Facts (read before starting)

Confirmed interfaces this plan builds on (do not re-derive):

- **`hedgefund.dsl.spec.StrategySpec`** — Pydantic model. Fields: `name`, `universe: list[str] | "all"`, `indicators: list[Indicator]`, `selection`, `sizing`, `rebalance`, `costs` (`.fee_bps`, `.slippage_bps`), `start: date`, `end: date`, `benchmark`. Construct from a dict with `StrategySpec.model_validate(d)`; serialize with `spec.model_dump(mode="json")`.
- **`hedgefund.data.panel.PricePanel`** — frozen dataclass with `open/high/low/close/volume` DataFrames (index = timestamps, columns = symbols). Methods: `is_tradable(symbol, t) -> bool`, `close_at(symbol, t) -> float`, `open_at(symbol, t) -> float`; props `dates`, `symbols`; classmethod `from_field_frames(frames)`; module constant `FIELDS = ("open","high","low","close","volume")`.
- **`hedgefund.engine.indicators.compute_all(indicators, close_df) -> dict[str, pd.DataFrame]`** — called as `compute_all(spec.indicators, close)`; each value is a DataFrame indexed by date, columns = symbols. Take a row with `frame.loc[ts]` (a `pd.Series`).
- **`hedgefund.engine.weights.target_weights(selection, sizing, indicator_rows, tradable, prev_state) -> dict[str, float]`** — `indicator_rows: dict[str, pd.Series]`, `prev_state: dict[str, bool]` (mutated in place, carries time-series long memory).
- **`hedgefund.engine.orders.rebalance_to_weights(portfolio, target_weights, fill_prices, portfolio_value, fee_bps, slippage_bps) -> dict[str, float]`** — mutates `portfolio`, returns `{symbol: filled_units_delta}`.
- **`hedgefund.engine.portfolio.Portfolio`** — `@dataclass` with `cash: float`, `positions: dict[str, float]`; method `value(prices: dict[str, float]) -> float`.
- **Backtest loop semantics (`engine/backtest.py`):** on each bar `t` — (1) fill the target decided last bar at `t`'s **open**, (2) mark to market at `t`'s **close** → equity point, (3) if a rebalance bar, decide a new target from indicator rows at `t`, to fill next bar. The forward step reproduces exactly this for one bar.
- **`hedgefund.data.fetch`** — `fetch_ohlcv(exchange, symbol, since_ms, limit=1000)` (currently hardcodes `timeframe="1d"`), `fetch_ohlcv_paginated(exchange, symbol, since_ms, limit=1000)` (steps cursor by `_DAY_MS`), `ohlcv_to_frame(rows) -> pd.DataFrame` (index `date`, cols `open/high/low/close/volume`).
- **`hedgefund.api.events`** — `create_queue(id) -> asyncio.Queue`, `get_queue(id) -> asyncio.Queue | None`, `remove_queue(id)`. Keyed by UUID; reused as-is for paper sessions.
- **`hedgefund.api.db.engine`** — `SessionLocal` (sessionmaker), `get_session` (FastAPI dependency yielding a `Session`).
- **Migration chain:** latest is `0002` (`down_revision="0001"`). New migration is `0003`, `down_revision="0002"`.
- **Patterns to mirror:** `api/db/agent_repository.py` (repository), `api/routes/agent_runs.py` (routes + SSE replay-then-stream), `migrations/versions/0002_add_agent_tables.py` (migration), `agents/runner.py` (async background task launched via `asyncio.create_task`, `session_factory=SessionLocal`).

**DB-dependent tests** require Postgres (`docker compose up -d db`) and `alembic upgrade head`. Pure-logic tests (`tests/paper/test_engine.py`, `test_state.py`, `test_ticker.py`, `test_resume.py`, `tests/data/test_fetch.py`) need neither.

Run all Python tests with the venv interpreter: `.venv/Scripts/python.exe -m pytest ...`.

---

## File Structure

**Create (backend):**
- `src/hedgefund/paper/__init__.py` — package marker, re-exports `PaperState`, `step`, `Fill`.
- `src/hedgefund/paper/state.py` — `PaperState` dataclass + `to_json`/`from_json`.
- `src/hedgefund/paper/engine.py` — `Fill` dataclass + `step()` forward-step.
- `src/hedgefund/paper/ticker.py` — `catch_up_session()` + `run_ticker_cycle()` + `ticker_loop()`.
- `src/hedgefund/paper/service.py` — `resolve_spec()` + `SpecResolutionError`.
- `src/hedgefund/api/db/paper_models.py` — `PaperSessionRow`, `PaperTradeRow`, `PaperEquityRow`.
- `src/hedgefund/api/db/paper_repository.py` — `PaperRepository`.
- `src/hedgefund/api/paper_schemas.py` — Pydantic request/response models.
- `src/hedgefund/api/routes/paper_sessions.py` — routes + SSE.
- `src/hedgefund/api/paper_panel.py` — `load_live_panel()` + `build_panel_from_rows()` + `get_paper_panel_loader`.
- `migrations/versions/0003_add_paper_tables.py` — three tables.

**Modify (backend):**
- `src/hedgefund/data/fetch.py` — timeframe-aware fetch.
- `src/hedgefund/api/config.py` — `paper_tick_interval_seconds`, `paper_fetch_lookback_bars`.
- `src/hedgefund/api/app.py` — include router; startup task to run ticker.
- `migrations/env.py` — import `paper_models` so metadata is registered.

**Create (frontend):**
- `dashboard/src/api/paperSessions.ts` (+ `.test.ts`) — fetch fns + `usePaperSessionEvents` hook.
- `dashboard/src/components/PaperSessionCard.tsx` (+ `.test.tsx`)
- `dashboard/src/components/HoldingsTable.tsx` (+ `.test.tsx`)
- `dashboard/src/components/LiveTradeFeed.tsx` (+ `.test.tsx`)
- `dashboard/src/pages/PaperStartPage.tsx` (+ `.test.tsx`)
- `dashboard/src/pages/PaperLivePage.tsx` (+ `.test.tsx`)
- `dashboard/src/pages/PaperHistoryPage.tsx` (+ `.test.tsx`)

**Modify (frontend):**
- `dashboard/src/types.ts` — paper types.
- `dashboard/src/App.tsx` — routes.
- `dashboard/src/components/NavBar.tsx` — link.
- `dashboard/src/pages/ResultPage.tsx` — "Paper trade this →" button.
- `dashboard/src/styles/global.css` — paper styles.

---

## Task 1: Timeframe-aware fetch layer

**Files:**
- Modify: `src/hedgefund/data/fetch.py`
- Test: `tests/data/test_fetch.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/data/test_fetch.py` (create the file if it does not exist; if it exists, append these tests):

```python
from hedgefund.data.fetch import fetch_ohlcv, fetch_ohlcv_paginated


class FakeExchange:
    """Records the timeframe/since of each call and returns scripted pages."""

    def __init__(self, pages):
        self._pages = list(pages)
        self.calls = []

    def fetch_ohlcv(self, symbol, timeframe, since, limit):
        self.calls.append({"symbol": symbol, "timeframe": timeframe, "since": since, "limit": limit})
        return self._pages.pop(0) if self._pages else []


def test_fetch_ohlcv_passes_timeframe_through():
    ex = FakeExchange([[[0, 1, 1, 1, 1, 1]]])
    fetch_ohlcv(ex, "BTC/USDT", since_ms=0, limit=10, timeframe="1h")
    assert ex.calls[0]["timeframe"] == "1h"


def test_paginated_steps_cursor_by_hour_for_1h():
    # One full page (len == limit) then a short page stops iteration.
    page1 = [[0, 1, 1, 1, 1, 1], [3_600_000, 1, 1, 1, 1, 1]]
    ex = FakeExchange([page1, []])
    fetch_ohlcv_paginated(ex, "BTC/USDT", since_ms=0, limit=2, timeframe="1h")
    # Second call's `since` advances past last_ts (3_600_000) by one hour.
    assert ex.calls[1]["since"] == 3_600_000 + 3_600_000


def test_paginated_steps_cursor_by_day_for_1d_default():
    page1 = [[0, 1, 1, 1, 1, 1], [86_400_000, 1, 1, 1, 1, 1]]
    ex = FakeExchange([page1, []])
    fetch_ohlcv_paginated(ex, "BTC/USDT", since_ms=0, limit=2)  # default 1d
    assert ex.calls[1]["since"] == 86_400_000 + 86_400_000
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/data/test_fetch.py -v`
Expected: FAIL — `fetch_ohlcv()` got an unexpected keyword argument `timeframe` (and the 1h cursor assertion fails).

- [ ] **Step 3: Implement timeframe-awareness**

Replace the top constants and the two functions in `src/hedgefund/data/fetch.py`:

```python
_COLUMNS = ["open", "high", "low", "close", "volume"]
_MS_PER_BAR = {"1m": 60_000, "15m": 900_000, "1h": 3_600_000, "1d": 86_400_000}


def fetch_ohlcv(
    exchange, symbol: str, since_ms: int | None, limit: int = 1000, timeframe: str = "1d"
) -> list[list[float]]:
    """Thin wrapper around ccxt fetch_ohlcv with retry/backoff. `exchange` is a
    ccxt exchange instance (injected so tests can pass a fake)."""
    for attempt in range(5):
        try:
            return exchange.fetch_ohlcv(symbol, timeframe=timeframe, since=since_ms, limit=limit)
        except Exception:  # noqa: BLE001 - ccxt raises many network error types
            if attempt == 4:
                raise
            time.sleep(2**attempt)
    return []


def fetch_ohlcv_paginated(
    exchange, symbol: str, since_ms: int | None, limit: int = 1000, timeframe: str = "1d"
) -> list[list[float]]:
    """Page through ccxt fetch_ohlcv from `since_ms` to the present for `timeframe`.

    ccxt returns at most `limit` bars per call, so this advances `since` past the
    last received bar (by one bar of `timeframe`) each page and concatenates
    results. The boundary bar is deduplicated; iteration stops on an empty page
    or a short (final) page. Returns time-sorted rows [ts_ms, o, h, l, c, v]."""
    step = _MS_PER_BAR[timeframe]
    all_rows: list[list[float]] = []
    cursor = since_ms
    last_ts: int | None = None
    while True:
        page = fetch_ohlcv(exchange, symbol, cursor, limit=limit, timeframe=timeframe)
        if not page:
            break
        raw_len = len(page)
        if last_ts is not None:
            page = [row for row in page if row[0] > last_ts]
        if not page:
            break
        all_rows.extend(page)
        last_ts = page[-1][0]
        cursor = last_ts + step
        if raw_len < limit:
            break
    return all_rows
```

Delete the now-unused `_DAY_MS` constant. Keep `ohlcv_to_frame` unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/data/test_fetch.py -v`
Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/data/fetch.py tests/data/test_fetch.py
git commit -m "feat(paper): make fetch layer timeframe-aware"
```

---

## Task 2: PaperState dataclass + serialization

**Files:**
- Create: `src/hedgefund/paper/__init__.py`
- Create: `src/hedgefund/paper/state.py`
- Test: `tests/paper/test_state.py`

- [ ] **Step 1: Create the package marker**

Create `src/hedgefund/paper/__init__.py`:

```python
from hedgefund.paper.engine import Fill, step
from hedgefund.paper.state import PaperState

__all__ = ["Fill", "PaperState", "step"]
```

(The `engine` import resolves in Task 3; create this file now but expect imports of `hedgefund.paper` to fail until Task 3 lands. Tests in this task import `hedgefund.paper.state` directly, so they are unaffected.)

- [ ] **Step 2: Write the failing test**

Create `tests/paper/__init__.py` (empty) and `tests/paper/test_state.py`:

```python
from hedgefund.paper.state import PaperState


def test_round_trip_json():
    state = PaperState(
        cash=9000.0,
        positions={"BTC/USDT": 0.1},
        pending_target={"BTC/USDT": 1.0},
        ts_state={"BTC/USDT": True},
        prev_ts="2026-06-17T00:00:00",
        last_processed_ts="2026-06-17T01:00:00",
    )
    restored = PaperState.from_json(state.to_json())
    assert restored == state


def test_initial_state_factory():
    state = PaperState.initial(starting_cash=10_000.0)
    assert state.cash == 10_000.0
    assert state.positions == {}
    assert state.pending_target is None
    assert state.ts_state == {}
    assert state.prev_ts is None
    assert state.last_processed_ts is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/paper/test_state.py -v`
Expected: FAIL — `No module named 'hedgefund.paper.state'`.

- [ ] **Step 4: Implement `PaperState`**

Create `src/hedgefund/paper/state.py`:

```python
from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class PaperState:
    """Resumable runtime state of a paper-trading session.

    Mirrors the locals carried across bars in `engine.backtest.run_backtest`:
    a Portfolio (cash + positions), the target decided last bar (filled this
    bar), and the time-series indicator memory. All fields are JSON-serializable
    so the whole state persists in `paper_sessions.state_json`.
    """

    cash: float
    positions: dict[str, float] = field(default_factory=dict)
    pending_target: dict[str, float] | None = None
    ts_state: dict[str, bool] = field(default_factory=dict)
    prev_ts: str | None = None
    last_processed_ts: str | None = None

    @classmethod
    def initial(cls, starting_cash: float) -> "PaperState":
        return cls(cash=starting_cash)

    def to_json(self) -> dict:
        return asdict(self)

    @classmethod
    def from_json(cls, data: dict) -> "PaperState":
        return cls(
            cash=data["cash"],
            positions=dict(data.get("positions") or {}),
            pending_target=(dict(data["pending_target"]) if data.get("pending_target") else None),
            ts_state=dict(data.get("ts_state") or {}),
            prev_ts=data.get("prev_ts"),
            last_processed_ts=data.get("last_processed_ts"),
        )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/paper/test_state.py -v`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add src/hedgefund/paper/__init__.py src/hedgefund/paper/state.py tests/paper/__init__.py tests/paper/test_state.py
git commit -m "feat(paper): add resumable PaperState with JSON round-trip"
```

---

## Task 3: Forward-step engine

**Files:**
- Create: `src/hedgefund/paper/engine.py`
- Test: `tests/paper/test_engine.py`

This is the core. `step()` reproduces one iteration of the backtest loop for one candle, taking precomputed indicator frames (computed once per fetch by the ticker, exactly as the backtest computes once before iterating).

- [ ] **Step 1: Write the failing tests**

Create `tests/paper/test_engine.py`:

```python
import pandas as pd
import pytest

from hedgefund.data.panel import PricePanel
from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.indicators import compute_all
from hedgefund.paper.engine import Fill, step
from hedgefund.paper.state import PaperState


def _panel(index, prices):
    """Single-symbol BTC/USDT panel; open==close==price for simple fills."""
    df = pd.DataFrame({"BTC/USDT": prices}, index=pd.DatetimeIndex(index))
    return PricePanel(open=df, high=df, low=df, close=df, volume=df * 0 + 1.0)


def _spec():
    # Time-series: go long when SMA(1) > 0 (always true for positive prices),
    # exit when SMA(1) < 0 (never) -> stays long once entered.
    return StrategySpec.model_validate({
        "name": "always-long",
        "universe": ["BTC/USDT"],
        "indicators": [{"type": "sma", "id": "s", "period": 1}],
        "selection": {"mode": "time_series",
                      "entry": {"indicator_id": "s", "op": ">", "value": 0},
                      "exit": {"indicator_id": "s", "op": "<", "value": 0}},
        "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
        "costs": {"fee_bps": 0.0, "slippage_bps": 0.0},
        "start": "2026-06-17", "end": "2026-06-18",
    })


def test_first_step_decides_target_but_does_not_fill():
    index = ["2026-06-17T00:00:00", "2026-06-17T01:00:00"]
    panel = _panel(index, [100.0, 110.0])
    spec = _spec()
    indicators = compute_all(spec.indicators, panel.close)
    state = PaperState.initial(starting_cash=10_000.0)
    ts0 = panel.close.index[0]

    new_state, fills, equity = step(spec, state, panel, indicators, ts0)

    assert fills == []                      # nothing pending to fill on bar 0
    assert equity == 10_000.0               # all cash, no positions
    assert new_state.pending_target == {"BTC/USDT": 1.0}  # decided, fills next bar
    assert new_state.prev_ts == ts0.isoformat()
    assert new_state.last_processed_ts == ts0.isoformat()


def test_second_step_fills_pending_target_at_open():
    index = ["2026-06-17T00:00:00", "2026-06-17T01:00:00"]
    panel = _panel(index, [100.0, 110.0])
    spec = _spec()
    indicators = compute_all(spec.indicators, panel.close)
    state = PaperState.initial(starting_cash=10_000.0)
    ts0, ts1 = panel.close.index[0], panel.close.index[1]

    state, _, _ = step(spec, state, panel, indicators, ts0)
    new_state, fills, equity = step(spec, state, panel, indicators, ts1)

    # Fill at bar 1 open (110.0): 10_000 / 110 units bought.
    assert len(fills) == 1
    assert fills[0].symbol == "BTC/USDT"
    assert fills[0].price == 110.0
    assert fills[0].units == pytest.approx(10_000.0 / 110.0, rel=1e-9)
    # Equity marked at bar 1 close (also 110.0) ~= 10_000 (zero costs).
    assert equity == pytest.approx(10_000.0, rel=1e-9)
    assert new_state.pending_target == {"BTC/USDT": 1.0}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/paper/test_engine.py -v`
Expected: FAIL — `No module named 'hedgefund.paper.engine'`.

- [ ] **Step 3: Implement `step()`**

Create `src/hedgefund/paper/engine.py`:

```python
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.orders import rebalance_to_weights
from hedgefund.engine.portfolio import Portfolio
from hedgefund.engine.weights import target_weights
from hedgefund.paper.state import PaperState


@dataclass(frozen=True)
class Fill:
    symbol: str
    units: float   # signed: +buy / -sell
    price: float


def step(
    spec: StrategySpec,
    state: PaperState,
    panel,                                  # PricePanel covering data up to >= ts
    indicators: dict[str, pd.DataFrame],    # precomputed over panel.close
    ts: pd.Timestamp,
) -> tuple[PaperState, list[Fill], float]:
    """Advance one session by one candle. Pure: no DB, no network.

    Reproduces one iteration of run_backtest's loop for bar `ts`:
      1) fill the target decided last bar at THIS bar's open,
      2) mark to market at THIS bar's close -> equity,
      3) decide a new target from indicator rows at `ts`, to fill next bar.
    Returns (new_state, fills_this_bar, equity_at_ts).
    """
    pf = Portfolio(cash=state.cash, positions=dict(state.positions))
    ts_state = dict(state.ts_state)
    prev_ts = pd.Timestamp(state.prev_ts) if state.prev_ts else None
    close = panel.close

    fills: list[Fill] = []

    # 1) Execute the target decided on the previous bar, at THIS bar's open.
    if state.pending_target is not None:
        tradable_now = [s for s in close.columns if panel.is_tradable(s, ts)]
        fill_prices = {s: panel.open_at(s, ts) for s in tradable_now}
        if pf.positions and prev_ts is not None:
            mark = {s: float(close.loc[prev_ts, s]) for s in pf.positions}
            pv = pf.value(mark)
        else:
            pv = pf.cash
        deltas = rebalance_to_weights(
            pf,
            target_weights={s: w for s, w in state.pending_target.items() if s in fill_prices},
            fill_prices=fill_prices,
            portfolio_value=pv,
            fee_bps=spec.costs.fee_bps,
            slippage_bps=spec.costs.slippage_bps,
        )
        fills = [Fill(symbol=s, units=d, price=fill_prices[s]) for s, d in deltas.items()]

    # 2) Mark to market at THIS bar's close.
    mark_prices = {s: panel.close_at(s, ts) for s in pf.positions if panel.is_tradable(s, ts)}
    equity = pf.value(mark_prices)

    # 3) Decide a new target from data <= ts (filled next bar).
    tradable = [s for s in close.columns if panel.is_tradable(s, ts)]
    rows = {iid: frame.loc[ts] for iid, frame in indicators.items()}
    new_pending = target_weights(spec.selection, spec.sizing, rows, tradable, ts_state)

    new_state = PaperState(
        cash=pf.cash,
        positions=dict(pf.positions),
        pending_target=new_pending,
        ts_state=ts_state,
        prev_ts=ts.isoformat(),
        last_processed_ts=ts.isoformat(),
    )
    return new_state, fills, equity
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/paper/test_engine.py -v`
Expected: PASS (both tests).

- [ ] **Step 5: Verify the package import now resolves**

Run: `.venv/Scripts/python.exe -c "import hedgefund.paper; print(hedgefund.paper.step, hedgefund.paper.Fill, hedgefund.paper.PaperState)"`
Expected: prints the three objects with no ImportError.

- [ ] **Step 6: Commit**

```bash
git add src/hedgefund/paper/engine.py tests/paper/test_engine.py
git commit -m "feat(paper): add pure forward-step engine reusing backtest logic"
```

---

## Task 4: ORM models

**Files:**
- Create: `src/hedgefund/api/db/paper_models.py`
- Modify: `migrations/env.py`

No standalone test (exercised via repository in Task 6). This task ends by confirming import + metadata registration.

- [ ] **Step 1: Create the models**

Create `src/hedgefund/api/db/paper_models.py` (mirror `agent_models.py` style; copy its exact `Base` import line):

```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from hedgefund.api.db.models import Base


class PaperSessionRow(Base):
    __tablename__ = "paper_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    spec_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    source_backtest_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("backtests.id"), nullable=True
    )
    universe: Mapped[list] = mapped_column(JSONB, nullable=False)
    timeframe: Mapped[str] = mapped_column(String, nullable=False, default="1h")
    starting_cash: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    state_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    last_processed_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PaperTradeRow(Base):
    __tablename__ = "paper_trades"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("paper_sessions.id"), nullable=False
    )
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    symbol: Mapped[str] = mapped_column(String, nullable=False)
    units: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    is_catchup: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class PaperEquityRow(Base):
    __tablename__ = "paper_equity"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("paper_sessions.id"), nullable=False
    )
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    equity: Mapped[float] = mapped_column(Float, nullable=False)
```

> If `Base` does not live in `hedgefund.api.db.models`, open `agent_models.py` and copy its exact `Base` import line.

- [ ] **Step 2: Register metadata for migrations**

In `migrations/env.py`, next to the existing `from hedgefund.api.db import agent_models as _agent_models  # noqa: F401` line, add:

```python
from hedgefund.api.db import paper_models as _paper_models  # noqa: F401
```

- [ ] **Step 3: Verify import + table registration**

Run: `.venv/Scripts/python.exe -c "from hedgefund.api.db import paper_models; from hedgefund.api.db.models import Base; print([t for t in Base.metadata.tables if 'paper' in t])"`
Expected: prints `['paper_sessions', 'paper_trades', 'paper_equity']` (order may vary).

- [ ] **Step 4: Commit**

```bash
git add src/hedgefund/api/db/paper_models.py migrations/env.py
git commit -m "feat(paper): add paper_sessions/paper_trades/paper_equity ORM models"
```

---

## Task 5: Alembic migration 0003

**Files:**
- Create: `migrations/versions/0003_add_paper_tables.py`

- [ ] **Step 1: Write the migration**

Create `migrations/versions/0003_add_paper_tables.py` (mirror `0002`):

```python
"""add paper_sessions, paper_trades, paper_equity tables

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "paper_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("spec_json", postgresql.JSONB(), nullable=False),
        sa.Column("source_backtest_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("backtests.id"), nullable=True),
        sa.Column("universe", postgresql.JSONB(), nullable=False),
        sa.Column("timeframe", sa.String(), nullable=False, server_default="1h"),
        sa.Column("starting_cash", sa.Float(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("state_json", postgresql.JSONB(), nullable=False),
        sa.Column("last_processed_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "paper_trades",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("paper_sessions.id"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(), nullable=False),
        sa.Column("units", sa.Float(), nullable=False),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("is_catchup", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_table(
        "paper_equity",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("paper_sessions.id"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("equity", sa.Float(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("paper_equity")
    op.drop_table("paper_trades")
    op.drop_table("paper_sessions")
```

- [ ] **Step 2: Apply the migration (requires Postgres)**

Run: `docker compose up -d db` then `.venv/Scripts/python.exe -m alembic upgrade head`
Expected: `Running upgrade 0002 -> 0003, add paper_sessions, paper_trades, paper_equity tables`.
If Postgres is unavailable, note it and proceed; the migration runs when the DB is up.

- [ ] **Step 3: Commit**

```bash
git add migrations/versions/0003_add_paper_tables.py
git commit -m "feat(paper): add migration 0003 for paper tables"
```

---

## Task 6: PaperRepository

**Files:**
- Create: `src/hedgefund/api/db/paper_repository.py`
- Test: `tests/api/test_paper_repository.py`

- [ ] **Step 1: Write the failing tests (DB-dependent)**

Create `tests/api/test_paper_repository.py` (mirror `tests/api/test_agent_repository.py` connection setup):

```python
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from hedgefund.api.db.models import Base
from hedgefund.api.db.paper_repository import PaperRepository

TEST_DB = "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test"


@pytest.fixture
def session():
    engine = create_engine(TEST_DB)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.rollback()
    s.close()
    Base.metadata.drop_all(engine)


def _spec_json():
    return {"name": "x", "universe": ["BTC/USDT"], "indicators": [],
            "selection": {"mode": "time_series",
                          "entry": {"indicator_id": "s", "op": ">", "value": 0},
                          "exit": {"indicator_id": "s", "op": "<", "value": 0}},
            "start": "2026-06-17", "end": "2026-06-18"}


def _state_json():
    return {"cash": 10_000.0, "positions": {}, "pending_target": None,
            "ts_state": {}, "prev_ts": None, "last_processed_ts": None}


def test_create_and_get_session(session):
    repo = PaperRepository(session)
    row = repo.create_session(
        label="t", spec_json=_spec_json(), source_backtest_id=None,
        universe=["BTC/USDT"], timeframe="1h", starting_cash=10_000.0,
        state_json=_state_json(),
    )
    session.commit()
    got = repo.get_session(row.id)
    assert got is not None and got.label == "t" and got.status == "active"


def test_list_active_sessions_excludes_stopped(session):
    repo = PaperRepository(session)
    a = repo.create_session(label="a", spec_json=_spec_json(), source_backtest_id=None,
                            universe=["BTC/USDT"], timeframe="1h", starting_cash=1.0,
                            state_json=_state_json())
    b = repo.create_session(label="b", spec_json=_spec_json(), source_backtest_id=None,
                            universe=["BTC/USDT"], timeframe="1h", starting_cash=1.0,
                            state_json=_state_json())
    session.commit()
    repo.stop_session(b.id)
    session.commit()
    active_ids = {s.id for s in repo.list_active_sessions()}
    assert a.id in active_ids and b.id not in active_ids


def test_record_tick_persists_state_trades_equity(session):
    repo = PaperRepository(session)
    row = repo.create_session(label="t", spec_json=_spec_json(), source_backtest_id=None,
                             universe=["BTC/USDT"], timeframe="1h", starting_cash=10_000.0,
                             state_json=_state_json())
    session.commit()
    ts = datetime(2026, 6, 17, 1, tzinfo=timezone.utc)
    repo.record_tick(
        session_id=row.id,
        state_json={"cash": 0.0, "positions": {"BTC/USDT": 1.0}},
        fills=[{"symbol": "BTC/USDT", "units": 1.0, "price": 100.0}],
        equity=10_000.0, ts=ts, is_catchup=True,
    )
    session.commit()
    trades = repo.list_trades(row.id)
    equity = repo.list_equity(row.id)
    refreshed = repo.get_session(row.id)
    assert len(trades) == 1 and trades[0].is_catchup is True
    assert len(equity) == 1 and equity[0].equity == 10_000.0
    assert refreshed.state_json["cash"] == 0.0
    assert refreshed.last_processed_ts is not None


def test_set_error_marks_session(session):
    repo = PaperRepository(session)
    row = repo.create_session(label="t", spec_json=_spec_json(), source_backtest_id=None,
                             universe=["BTC/USDT"], timeframe="1h", starting_cash=1.0,
                             state_json=_state_json())
    session.commit()
    repo.set_error(row.id, "boom")
    session.commit()
    got = repo.get_session(row.id)
    assert got.status == "error" and got.error == "boom"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_paper_repository.py -v`
Expected: FAIL — `No module named 'hedgefund.api.db.paper_repository'` (or connection error if Postgres is down — start it with `docker compose up -d db` and create the `hedgefund_test` database).

- [ ] **Step 3: Implement the repository**

Create `src/hedgefund/api/db/paper_repository.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update as sa_update
from sqlalchemy.orm import Session

from hedgefund.api.db.paper_models import PaperEquityRow, PaperSessionRow, PaperTradeRow


class PaperRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def create_session(
        self,
        *,
        label: str,
        spec_json: dict,
        source_backtest_id: uuid.UUID | None,
        universe: list[str],
        timeframe: str,
        starting_cash: float,
        state_json: dict,
    ) -> PaperSessionRow:
        row = PaperSessionRow(
            id=uuid.uuid4(),
            label=label,
            spec_json=spec_json,
            source_backtest_id=source_backtest_id,
            universe=universe,
            timeframe=timeframe,
            starting_cash=starting_cash,
            status="active",
            state_json=state_json,
        )
        self._s.add(row)
        self._s.flush()
        return row

    def get_session(self, session_id: uuid.UUID) -> PaperSessionRow | None:
        return self._s.get(PaperSessionRow, session_id)

    def get_status(self, session_id: uuid.UUID) -> str | None:
        row = self._s.get(PaperSessionRow, session_id)
        return row.status if row else None

    def list_sessions(self) -> list[PaperSessionRow]:
        stmt = select(PaperSessionRow).order_by(PaperSessionRow.created_at.desc())
        return list(self._s.scalars(stmt).all())

    def list_active_sessions(self) -> list[PaperSessionRow]:
        stmt = select(PaperSessionRow).where(PaperSessionRow.status == "active")
        return list(self._s.scalars(stmt).all())

    def list_trades(self, session_id: uuid.UUID) -> list[PaperTradeRow]:
        stmt = (
            select(PaperTradeRow)
            .where(PaperTradeRow.session_id == session_id)
            .order_by(PaperTradeRow.ts)
        )
        return list(self._s.scalars(stmt).all())

    def list_equity(self, session_id: uuid.UUID) -> list[PaperEquityRow]:
        stmt = (
            select(PaperEquityRow)
            .where(PaperEquityRow.session_id == session_id)
            .order_by(PaperEquityRow.ts)
        )
        return list(self._s.scalars(stmt).all())

    def record_tick(
        self,
        *,
        session_id: uuid.UUID,
        state_json: dict,
        fills: list[dict],
        equity: float,
        ts: datetime,
        is_catchup: bool,
    ) -> None:
        """Persist one processed candle: update session state + high-water mark,
        append one equity point, append a trade row per fill. Caller commits."""
        for f in fills:
            self._s.add(PaperTradeRow(
                id=uuid.uuid4(), session_id=session_id, ts=ts,
                symbol=f["symbol"], units=f["units"], price=f["price"],
                is_catchup=is_catchup,
            ))
        self._s.add(PaperEquityRow(id=uuid.uuid4(), session_id=session_id, ts=ts, equity=equity))
        self._s.execute(
            sa_update(PaperSessionRow)
            .where(PaperSessionRow.id == session_id)
            .values(state_json=state_json, last_processed_ts=ts)
        )

    def stop_session(self, session_id: uuid.UUID) -> None:
        self._s.execute(
            sa_update(PaperSessionRow)
            .where(PaperSessionRow.id == session_id)
            .values(status="stopped", stopped_at=datetime.now(timezone.utc))
        )

    def set_error(self, session_id: uuid.UUID, message: str) -> None:
        self._s.execute(
            sa_update(PaperSessionRow)
            .where(PaperSessionRow.id == session_id)
            .values(status="error", error=message)
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_paper_repository.py -v`
Expected: PASS (4 tests). Requires Postgres + `hedgefund_test` DB.

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/db/paper_repository.py tests/api/test_paper_repository.py
git commit -m "feat(paper): add PaperRepository with tick persistence"
```

---

## Task 7: Live panel loader (ccxt → PricePanel)

**Files:**
- Create: `src/hedgefund/api/paper_panel.py`
- Test: `tests/paper/test_paper_panel.py`

Builds a `PricePanel` from a live, timeframe-aware ccxt fetch covering the last `lookback_bars` up to now. Injectable so the ticker and tests can pass a fake exchange/loader.

- [ ] **Step 1: Write the failing test**

Create `tests/paper/test_paper_panel.py`:

```python
from hedgefund.api.paper_panel import build_panel_from_rows


def test_build_panel_from_rows_aligns_symbols():
    rows_by_symbol = {
        "BTC/USDT": [[0, 100, 101, 99, 100, 1], [3_600_000, 100, 102, 99, 110, 1]],
        "ETH/USDT": [[0, 10, 11, 9, 10, 5], [3_600_000, 10, 12, 9, 11, 5]],
    }
    panel = build_panel_from_rows(rows_by_symbol)
    assert list(panel.symbols) == ["BTC/USDT", "ETH/USDT"]
    assert len(panel.dates) == 2
    assert panel.close_at("BTC/USDT", panel.close.index[1]) == 110.0
    assert panel.open_at("ETH/USDT", panel.close.index[0]) == 10.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/paper/test_paper_panel.py -v`
Expected: FAIL — `No module named 'hedgefund.api.paper_panel'`.

- [ ] **Step 3: Implement the loader**

Create `src/hedgefund/api/paper_panel.py`:

```python
from __future__ import annotations

import time
from collections.abc import Callable

import pandas as pd

from hedgefund.data.fetch import fetch_ohlcv_paginated, ohlcv_to_frame
from hedgefund.data.panel import FIELDS, PricePanel

# Loader signature: (symbols, timeframe, lookback_bars) -> PricePanel
PaperPanelLoader = Callable[[list[str], str, int], PricePanel]

_MS_PER_BAR = {"1m": 60_000, "15m": 900_000, "1h": 3_600_000, "1d": 86_400_000}


def build_panel_from_rows(rows_by_symbol: dict[str, list[list[float]]]) -> PricePanel:
    """Assemble ccxt OHLCV rows per symbol into one aligned PricePanel.

    The union of all symbols' timestamps forms the index; a symbol missing a bar
    stays NaN and is therefore not tradable on that bar (same convention as
    `data.panel.load_panel`)."""
    frames = {sym: ohlcv_to_frame(rows) for sym, rows in rows_by_symbol.items()}
    symbols = list(rows_by_symbol.keys())
    field_frames: dict[str, pd.DataFrame] = {}
    for fld in FIELDS:
        wide = pd.DataFrame({sym: frames[sym][fld] for sym in symbols}).sort_index()
        field_frames[fld] = wide
    return PricePanel.from_field_frames(field_frames)


def load_live_panel(
    exchange, symbols: list[str], timeframe: str, lookback_bars: int
) -> PricePanel:
    """Fetch the last `lookback_bars` of `timeframe` candles up to now for each
    symbol and assemble a PricePanel. `exchange` is a ccxt instance (injected)."""
    step = _MS_PER_BAR[timeframe]
    now_ms = int(time.time() * 1000)
    since_ms = now_ms - lookback_bars * step
    rows_by_symbol = {
        sym: fetch_ohlcv_paginated(exchange, sym, since_ms, timeframe=timeframe)
        for sym in symbols
    }
    return build_panel_from_rows(rows_by_symbol)


def get_paper_panel_loader() -> PaperPanelLoader:
    """Default loader using a ccxt binance instance. Overridden in tests by
    passing a fake loader to the ticker."""

    def _load(symbols: list[str], timeframe: str, lookback_bars: int) -> PricePanel:
        import ccxt  # local import: only needed when actually trading live

        exchange = ccxt.binance()
        return load_live_panel(exchange, symbols, timeframe, lookback_bars)

    return _load
```

> Confirm `FIELDS` is exported from `data/panel.py` (it is: `FIELDS = ("open","high","low","close","volume")`).

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/paper/test_paper_panel.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/paper_panel.py tests/paper/test_paper_panel.py
git commit -m "feat(paper): add live ccxt panel loader"
```

---

## Task 8: Ticker (catch-up loop)

**Files:**
- Create: `src/hedgefund/paper/ticker.py`
- Test: `tests/paper/test_ticker.py`

`catch_up_session()` is the unit under test: given a session row, a panel, and a repo, it processes every candle after `last_processed_ts`, calling `step()` and `record_tick()`, publishing events, honoring stop, isolating errors.

- [ ] **Step 1: Write the failing tests**

Create `tests/paper/test_ticker.py`:

```python
import uuid

import pandas as pd

from hedgefund.data.panel import PricePanel
from hedgefund.paper.state import PaperState
from hedgefund.paper.ticker import catch_up_session


class FakeRepo:
    def __init__(self, status="active"):
        self.ticks = []
        self.errors = []
        self._status = status

    def get_status(self, sid):
        return self._status

    def record_tick(self, *, session_id, state_json, fills, equity, ts, is_catchup):
        self.ticks.append({"ts": ts, "equity": equity, "fills": fills,
                           "is_catchup": is_catchup, "state": state_json})

    def set_error(self, sid, msg):
        self.errors.append(msg)


class FakeSession:
    def __init__(self, spec_json, state, universe=("BTC/USDT",), tf="1h"):
        self.id = uuid.uuid4()
        self.spec_json = spec_json
        self.state_json = state.to_json()
        self.universe = list(universe)
        self.timeframe = tf
        self.starting_cash = 10_000.0


def _panel(index, prices):
    df = pd.DataFrame({"BTC/USDT": prices}, index=pd.DatetimeIndex(index))
    return PricePanel(open=df, high=df, low=df, close=df, volume=df * 0 + 1.0)


def _spec_json():
    return {"name": "always-long", "universe": ["BTC/USDT"],
            "indicators": [{"type": "sma", "id": "s", "period": 1}],
            "selection": {"mode": "time_series",
                          "entry": {"indicator_id": "s", "op": ">", "value": 0},
                          "exit": {"indicator_id": "s", "op": "<", "value": 0}},
            "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
            "costs": {"fee_bps": 0.0, "slippage_bps": 0.0},
            "start": "2026-06-17", "end": "2026-06-30"}


def test_processes_only_candles_after_high_water_mark():
    index = ["2026-06-17T00:00:00", "2026-06-17T01:00:00", "2026-06-17T02:00:00"]
    panel = _panel(index, [100.0, 110.0, 120.0])
    state = PaperState.initial(10_000.0)
    state.last_processed_ts = pd.Timestamp(index[0]).isoformat()  # bar 0 already done
    sess = FakeSession(_spec_json(), state)
    repo = FakeRepo()
    published = []

    catch_up_session(sess, panel, repo, publish=lambda ev: published.append(ev))

    assert [t["ts"] for t in repo.ticks] == [
        panel.close.index[1].to_pydatetime(), panel.close.index[2].to_pydatetime()]
    assert all(t["is_catchup"] for t in repo.ticks)   # >1 candle => catch-up
    assert all(ev["type"] == "tick" for ev in published)


def test_single_new_candle_is_not_catchup():
    index = ["2026-06-17T00:00:00", "2026-06-17T01:00:00"]
    panel = _panel(index, [100.0, 110.0])
    state = PaperState.initial(10_000.0)
    state.last_processed_ts = pd.Timestamp(index[0]).isoformat()
    sess = FakeSession(_spec_json(), state)
    repo = FakeRepo()

    catch_up_session(sess, panel, repo, publish=lambda ev: None)

    assert len(repo.ticks) == 1
    assert repo.ticks[0]["is_catchup"] is False


def test_stop_mid_backfill_halts():
    index = ["2026-06-17T00:00:00", "2026-06-17T01:00:00", "2026-06-17T02:00:00"]
    panel = _panel(index, [100.0, 110.0, 120.0])
    state = PaperState.initial(10_000.0)  # last_processed_ts None => all candles pending
    sess = FakeSession(_spec_json(), state)
    repo = FakeRepo(status="stopped")  # already stopped
    catch_up_session(sess, panel, repo, publish=lambda ev: None)
    assert repo.ticks == []  # status checked before each candle


def test_error_is_isolated_and_recorded():
    panel = _panel(["2026-06-17T00:00:00"], [100.0])
    sess = FakeSession({"bad": "spec"}, PaperState.initial(10_000.0))  # invalid spec
    repo = FakeRepo()
    catch_up_session(sess, panel, repo, publish=lambda ev: None)
    assert repo.errors  # set_error called, no exception escapes
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/paper/test_ticker.py -v`
Expected: FAIL — `No module named 'hedgefund.paper.ticker'`.

- [ ] **Step 3: Implement the ticker**

Create `src/hedgefund/paper/ticker.py`:

```python
from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

import pandas as pd

from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.indicators import compute_all
from hedgefund.paper.engine import step
from hedgefund.paper.state import PaperState

logger = logging.getLogger(__name__)


def catch_up_session(session_row, panel, repo, publish: Callable[[dict], None]) -> None:
    """Advance one session through every candle after its high-water mark.

    I/O is the injected `repo` and `publish`. Isolates errors so one bad session
    never aborts the shared ticker. `panel` covers the lookback window through
    now for this session's universe."""
    try:
        spec = StrategySpec.model_validate(session_row.spec_json)
        state = PaperState.from_json(session_row.state_json)
        last = pd.Timestamp(state.last_processed_ts) if state.last_processed_ts else None
        candles = [ts for ts in panel.close.index if last is None or ts > last]
        if not candles:
            return
        is_catchup = len(candles) > 1
        indicators = compute_all(spec.indicators, panel.close)
        for ts in candles:
            if repo.get_status(session_row.id) != "active":
                break
            new_state, fills, equity = step(spec, state, panel, indicators, ts)
            fill_dicts = [{"symbol": f.symbol, "units": f.units, "price": f.price} for f in fills]
            repo.record_tick(
                session_id=session_row.id,
                state_json=new_state.to_json(),
                fills=fill_dicts,
                equity=equity,
                ts=ts.to_pydatetime(),
                is_catchup=is_catchup,
            )
            publish({
                "type": "tick",
                "ts": ts.isoformat(),
                "equity": equity,
                "cash": new_state.cash,
                "positions": new_state.positions,
                "fills": fill_dicts,
                "is_catchup": is_catchup,
            })
            state = new_state
    except Exception as exc:  # noqa: BLE001 - isolate per-session failure
        logger.exception("paper session %s failed", getattr(session_row, "id", "?"))
        repo.set_error(session_row.id, str(exc))


def run_ticker_cycle(repo, panel_loader, publish_for, lookback_bars: int) -> None:
    """One catch-up pass over all active sessions. Groups sessions by
    (universe, timeframe) so each group fetches a panel once."""
    active = repo.list_active_sessions()
    if not active:
        return
    groups: dict[tuple, list] = {}
    for s in active:
        groups.setdefault((frozenset(s.universe), s.timeframe), []).append(s)
    for (universe, timeframe), sessions in groups.items():
        try:
            panel = panel_loader(sorted(universe), timeframe, lookback_bars)
        except Exception:  # noqa: BLE001 - transient fetch failure; retry next cycle
            logger.warning("panel fetch failed for %s/%s; retrying next cycle", universe, timeframe)
            continue
        for s in sessions:
            catch_up_session(s, panel, repo, publish_for(s.id))


async def ticker_loop(
    session_factory, panel_loader, publish_for, interval_seconds: int, lookback_bars: int
) -> None:
    """Background loop: every `interval_seconds`, run one catch-up cycle in a
    worker thread (sync DB + ccxt) so the event loop stays responsive."""
    from hedgefund.api.db.paper_repository import PaperRepository

    while True:
        def _cycle() -> None:
            db = session_factory()
            try:
                repo = PaperRepository(db)
                run_ticker_cycle(repo, panel_loader, publish_for, lookback_bars)
                db.commit()
            finally:
                db.close()

        try:
            await asyncio.to_thread(_cycle)
        except Exception:  # noqa: BLE001 - never let the loop die
            logger.exception("ticker cycle crashed; continuing")
        await asyncio.sleep(interval_seconds)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/paper/test_ticker.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/paper/ticker.py tests/paper/test_ticker.py
git commit -m "feat(paper): add shared catch-up ticker with error isolation"
```

---

## Task 9: Resume-equivalence test

**Files:**
- Test: `tests/paper/test_resume.py`

Proves a session interrupted and resumed from persisted `PaperState` produces an identical continuation — the crash-safe guarantee. No new production code.

- [ ] **Step 1: Write the test**

Create `tests/paper/test_resume.py`:

```python
import pandas as pd

from hedgefund.data.panel import PricePanel
from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.indicators import compute_all
from hedgefund.paper.engine import step
from hedgefund.paper.state import PaperState


def _panel(index, prices):
    df = pd.DataFrame({"BTC/USDT": prices}, index=pd.DatetimeIndex(index))
    return PricePanel(open=df, high=df, low=df, close=df, volume=df * 0 + 1.0)


def _spec():
    return StrategySpec.model_validate({
        "name": "always-long", "universe": ["BTC/USDT"],
        "indicators": [{"type": "sma", "id": "s", "period": 1}],
        "selection": {"mode": "time_series",
                      "entry": {"indicator_id": "s", "op": ">", "value": 0},
                      "exit": {"indicator_id": "s", "op": "<", "value": 0}},
        "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
        "costs": {"fee_bps": 10.0, "slippage_bps": 5.0},
        "start": "2026-06-17", "end": "2026-06-30"})


def test_resume_from_serialized_state_matches_uninterrupted():
    index = ["2026-06-17T00:00:00", "2026-06-17T01:00:00",
             "2026-06-17T02:00:00", "2026-06-17T03:00:00"]
    panel = _panel(index, [100.0, 110.0, 105.0, 120.0])
    spec = _spec()
    indicators = compute_all(spec.indicators, panel.close)

    # Uninterrupted run across all four bars.
    s = PaperState.initial(10_000.0)
    eqs_a = []
    for ts in panel.close.index:
        s, _, eq = step(spec, s, panel, indicators, ts)
        eqs_a.append(eq)

    # Interrupted: run two bars, serialize -> deserialize, run the rest.
    s = PaperState.initial(10_000.0)
    eqs_b = []
    for ts in panel.close.index[:2]:
        s, _, eq = step(spec, s, panel, indicators, ts)
        eqs_b.append(eq)
    s = PaperState.from_json(s.to_json())  # simulate restart
    for ts in panel.close.index[2:]:
        s, _, eq = step(spec, s, panel, indicators, ts)
        eqs_b.append(eq)

    assert eqs_b == eqs_a
```

- [ ] **Step 2: Run test to verify it passes (no new code)**

Run: `.venv/Scripts/python.exe -m pytest tests/paper/test_resume.py -v`
Expected: PASS — this validates Tasks 2 & 3; if it fails, the bug is in `PaperState` serialization or `step()`.

- [ ] **Step 3: Commit**

```bash
git add tests/paper/test_resume.py
git commit -m "test(paper): prove resume-from-state equivalence"
```

---

## Task 10: Service layer (spec resolution)

**Files:**
- Create: `src/hedgefund/paper/service.py`
- Test: `tests/paper/test_service.py`

`resolve_spec()` turns a request (one of `source_backtest_id` / `spec_json`) into a validated `StrategySpec` + universe; raises on invalid input. The unit-testable core of session creation, independent of FastAPI.

- [ ] **Step 1: Write the failing tests**

Create `tests/paper/test_service.py`:

```python
import pytest

from hedgefund.paper.service import SpecResolutionError, resolve_spec


def _spec_json():
    return {"name": "x", "universe": ["BTC/USDT", "ETH/USDT"],
            "indicators": [{"type": "sma", "id": "s", "period": 2}],
            "selection": {"mode": "time_series",
                          "entry": {"indicator_id": "s", "op": ">", "value": 0},
                          "exit": {"indicator_id": "s", "op": "<", "value": 0}},
            "start": "2026-06-17", "end": "2026-06-30"}


def test_resolve_from_spec_json_returns_spec_and_universe():
    spec, universe = resolve_spec(spec_json=_spec_json(), source_backtest_id=None,
                                  backtest_spec_lookup=lambda _id: None)
    assert spec.name == "x"
    assert universe == ["BTC/USDT", "ETH/USDT"]


def test_resolve_from_backtest_id_uses_lookup():
    spec, universe = resolve_spec(spec_json=None, source_backtest_id="abc",
                                  backtest_spec_lookup=lambda _id: _spec_json())
    assert universe == ["BTC/USDT", "ETH/USDT"]


def test_resolve_rejects_neither_source():
    with pytest.raises(SpecResolutionError):
        resolve_spec(spec_json=None, source_backtest_id=None, backtest_spec_lookup=lambda _id: None)


def test_resolve_rejects_both_sources():
    with pytest.raises(SpecResolutionError):
        resolve_spec(spec_json=_spec_json(), source_backtest_id="abc",
                     backtest_spec_lookup=lambda _id: _spec_json())


def test_resolve_rejects_unknown_backtest():
    with pytest.raises(SpecResolutionError):
        resolve_spec(spec_json=None, source_backtest_id="missing",
                     backtest_spec_lookup=lambda _id: None)


def test_resolve_rejects_invalid_spec_json():
    with pytest.raises(SpecResolutionError):
        resolve_spec(spec_json={"name": "broken"}, source_backtest_id=None,
                     backtest_spec_lookup=lambda _id: None)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/paper/test_service.py -v`
Expected: FAIL — `No module named 'hedgefund.paper.service'`.

- [ ] **Step 3: Implement the service**

Create `src/hedgefund/paper/service.py`:

```python
from __future__ import annotations

from collections.abc import Callable

from pydantic import ValidationError

from hedgefund.dsl.spec import StrategySpec

# Looks up a backtest's stored spec_json by id; returns None if not found.
BacktestSpecLookup = Callable[[object], dict | None]


class SpecResolutionError(ValueError):
    """Raised when a paper-session request cannot be resolved to a valid spec."""


def resolve_spec(
    *,
    spec_json: dict | None,
    source_backtest_id: object | None,
    backtest_spec_lookup: BacktestSpecLookup,
) -> tuple[StrategySpec, list[str]]:
    """Resolve a create-session request into a validated StrategySpec + universe.

    Exactly one of `spec_json` / `source_backtest_id` must be provided."""
    if (spec_json is None) == (source_backtest_id is None):
        raise SpecResolutionError(
            "provide exactly one of 'spec_json' or 'source_backtest_id'"
        )

    raw = spec_json
    if source_backtest_id is not None:
        raw = backtest_spec_lookup(source_backtest_id)
        if raw is None:
            raise SpecResolutionError(f"backtest {source_backtest_id!r} not found")

    try:
        spec = StrategySpec.model_validate(raw)
    except ValidationError as exc:
        raise SpecResolutionError(f"invalid strategy spec: {exc}") from exc

    universe = spec.universe if isinstance(spec.universe, list) else []
    if not universe:
        raise SpecResolutionError("spec.universe must be an explicit symbol list for paper trading")
    return spec, universe
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/paper/test_service.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/paper/service.py tests/paper/test_service.py
git commit -m "feat(paper): add spec-resolution service"
```

---

## Task 11: Pydantic schemas

**Files:**
- Create: `src/hedgefund/api/paper_schemas.py`
- Test: `tests/api/test_paper_schemas.py`

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_paper_schemas.py`:

```python
import pytest
from pydantic import ValidationError

from hedgefund.api.paper_schemas import CreatePaperSessionRequest


def test_accepts_spec_json_only():
    req = CreatePaperSessionRequest(label="t", spec_json={"name": "x"}, starting_cash=5000.0)
    assert req.starting_cash == 5000.0


def test_defaults_starting_cash():
    req = CreatePaperSessionRequest(label="t", spec_json={"name": "x"})
    assert req.starting_cash == 10_000.0


def test_rejects_nonpositive_cash():
    with pytest.raises(ValidationError):
        CreatePaperSessionRequest(label="t", spec_json={"name": "x"}, starting_cash=0.0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_paper_schemas.py -v`
Expected: FAIL — `No module named 'hedgefund.api.paper_schemas'`.

- [ ] **Step 3: Implement the schemas**

Create `src/hedgefund/api/paper_schemas.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_paper_schemas.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/paper_schemas.py tests/api/test_paper_schemas.py
git commit -m "feat(paper): add paper session Pydantic schemas"
```

---

## Task 12: Config additions

**Files:**
- Modify: `src/hedgefund/api/config.py`
- Test: `tests/api/test_paper_config.py`

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_paper_config.py`:

```python
from hedgefund.api.config import Settings


def test_settings_has_paper_defaults():
    s = Settings(
        database_url="x", anthropic_api_key=None, anthropic_model="m",
        paper_tick_interval_seconds=60, paper_fetch_lookback_bars=1000,
    )
    assert s.paper_tick_interval_seconds == 60
    assert s.paper_fetch_lookback_bars == 1000
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_paper_config.py -v`
Expected: FAIL — `Settings.__init__() got an unexpected keyword argument`.

- [ ] **Step 3: Extend `Settings`**

Edit `src/hedgefund/api/config.py` — add the two params to `Settings.__init__` and populate them in `get_settings`:

```python
class Settings:
    def __init__(
        self,
        database_url: str,
        anthropic_api_key: str | None,
        anthropic_model: str,
        paper_tick_interval_seconds: int = 60,
        paper_fetch_lookback_bars: int = 1000,
    ) -> None:
        self.database_url = database_url
        self.anthropic_api_key = anthropic_api_key
        self.anthropic_model = anthropic_model
        self.paper_tick_interval_seconds = paper_tick_interval_seconds
        self.paper_fetch_lookback_bars = paper_fetch_lookback_bars


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL", _DEFAULT_DB_URL),
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"),
        anthropic_model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
        paper_tick_interval_seconds=int(os.environ.get("PAPER_TICK_INTERVAL_SECONDS", "60")),
        paper_fetch_lookback_bars=int(os.environ.get("PAPER_FETCH_LOOKBACK_BARS", "1000")),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_paper_config.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/config.py tests/api/test_paper_config.py
git commit -m "feat(paper): add paper ticker config settings"
```

---

## Task 13: Routes + SSE

**Files:**
- Create: `src/hedgefund/api/routes/paper_sessions.py`
- Test: `tests/api/test_paper_sessions.py`

Mirror `routes/agent_runs.py`: dependency-injected session, `PaperRepository`, SSE replay-then-stream off `events.py`. The backtest spec lookup uses the existing `BacktestRepository`.

> **Ordering note:** Task 13's route tests require the router mounted (Task 14 Step 1). If executing strictly task-by-task, do Task 14 Step 1 (`include_router`) before running this task's Step 4, then finish Task 14.

- [ ] **Step 1: Write the failing tests (TestClient; ticker NOT started)**

Create `tests/api/test_paper_sessions.py`:

```python
import uuid

import pytest
from fastapi.testclient import TestClient

from hedgefund.api.app import app
from hedgefund.api.db.engine import get_session


def _spec_json():
    return {"name": "x", "universe": ["BTC/USDT"],
            "indicators": [{"type": "sma", "id": "s", "period": 2}],
            "selection": {"mode": "time_series",
                          "entry": {"indicator_id": "s", "op": ">", "value": 0},
                          "exit": {"indicator_id": "s", "op": "<", "value": 0}},
            "start": "2026-06-17", "end": "2026-06-30"}


@pytest.fixture
def client(db_session):  # db_session fixture mirrors tests/api/test_agent_runs.py
    app.dependency_overrides[get_session] = lambda: db_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_post_creates_session_from_spec_json(client):
    r = client.post("/paper-sessions", json={"label": "t", "spec_json": _spec_json()})
    assert r.status_code == 201
    body = r.json()
    assert body["label"] == "t" and body["status"] == "active"
    assert body["universe"] == ["BTC/USDT"] and body["timeframe"] == "1h"


def test_post_rejects_both_sources(client):
    r = client.post("/paper-sessions", json={
        "label": "t", "spec_json": _spec_json(), "source_backtest_id": str(uuid.uuid4())})
    assert r.status_code == 422


def test_post_rejects_neither_source(client):
    r = client.post("/paper-sessions", json={"label": "t"})
    assert r.status_code == 422


def test_post_rejects_invalid_spec(client):
    r = client.post("/paper-sessions", json={"label": "t", "spec_json": {"name": "broken"}})
    assert r.status_code == 422


def test_list_and_get_and_stop(client):
    created = client.post("/paper-sessions", json={"label": "t", "spec_json": _spec_json()}).json()
    sid = created["id"]
    assert any(s["id"] == sid for s in client.get("/paper-sessions").json())
    detail = client.get(f"/paper-sessions/{sid}").json()
    assert detail["spec_json"]["name"] == "x"
    assert detail["equity"] == [] and detail["trades"] == []
    stopped = client.post(f"/paper-sessions/{sid}/stop").json()
    assert stopped["status"] == "stopped"


def test_get_missing_returns_404(client):
    assert client.get(f"/paper-sessions/{uuid.uuid4()}").status_code == 404
```

> Reuse the `db_session` fixture from `tests/api/test_agent_runs.py` (move it into `tests/api/conftest.py` if not already shared). The ticker must NOT start in tests — Task 14 guards startup behind `PAPER_TICKER_ENABLED`, and `tests/api/conftest.py` sets it to `0`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_paper_sessions.py -v`
Expected: FAIL — 404 on `/paper-sessions` (router not mounted yet) or import error.

- [ ] **Step 3: Implement the routes**

Create `src/hedgefund/api/routes/paper_sessions.py`:

```python
from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from hedgefund.api import events
from hedgefund.api.db.engine import get_session
from hedgefund.api.db.paper_repository import PaperRepository
from hedgefund.api.db.repository import BacktestRepository
from hedgefund.api.paper_schemas import (
    CreatePaperSessionRequest,
    PaperEquityOut,
    PaperSessionDetail,
    PaperSessionResponse,
    PaperTradeOut,
)
from hedgefund.paper.service import SpecResolutionError, resolve_spec
from hedgefund.paper.state import PaperState

router = APIRouter(prefix="/paper-sessions", tags=["paper-sessions"])


def _lookup_backtest_spec(session: Session):
    repo = BacktestRepository(session)

    def _lookup(backtest_id):
        row = repo.get(uuid.UUID(str(backtest_id)))
        if row is None:
            return None
        # BacktestRow stores the spec as `spec_json`; confirm the column name in repository.py.
        return row.spec_json

    return _lookup


@router.post("", response_model=PaperSessionResponse, status_code=status.HTTP_201_CREATED)
def create_paper_session(
    body: CreatePaperSessionRequest,
    session: Session = Depends(get_session),
) -> PaperSessionResponse:
    try:
        spec, universe = resolve_spec(
            spec_json=body.spec_json,
            source_backtest_id=body.source_backtest_id,
            backtest_spec_lookup=_lookup_backtest_spec(session),
        )
    except SpecResolutionError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    repo = PaperRepository(session)
    row = repo.create_session(
        label=body.label,
        spec_json=spec.model_dump(mode="json"),
        source_backtest_id=body.source_backtest_id,
        universe=universe,
        timeframe="1h",
        starting_cash=body.starting_cash,
        state_json=PaperState.initial(body.starting_cash).to_json(),
    )
    session.commit()
    session.refresh(row)
    events.create_queue(row.id)
    return PaperSessionResponse.model_validate(row)


@router.get("", response_model=list[PaperSessionResponse])
def list_paper_sessions(session: Session = Depends(get_session)) -> list[PaperSessionResponse]:
    repo = PaperRepository(session)
    return [PaperSessionResponse.model_validate(r) for r in repo.list_sessions()]


@router.get("/{session_id}", response_model=PaperSessionDetail)
def get_paper_session(
    session_id: uuid.UUID, session: Session = Depends(get_session)
) -> PaperSessionDetail:
    repo = PaperRepository(session)
    row = repo.get_session(session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="paper session not found")
    detail = PaperSessionDetail.model_validate(row)
    detail.equity = [PaperEquityOut.model_validate(e) for e in repo.list_equity(session_id)]
    detail.trades = [PaperTradeOut.model_validate(t) for t in repo.list_trades(session_id)]
    return detail


@router.post("/{session_id}/stop", response_model=PaperSessionResponse)
def stop_paper_session(
    session_id: uuid.UUID, session: Session = Depends(get_session)
) -> PaperSessionResponse:
    repo = PaperRepository(session)
    row = repo.get_session(session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="paper session not found")
    repo.stop_session(session_id)
    session.commit()
    session.refresh(row)
    return PaperSessionResponse.model_validate(row)


@router.get("/{session_id}/events")
async def stream_paper_session_events(
    session_id: uuid.UUID, session: Session = Depends(get_session)
) -> StreamingResponse:
    repo = PaperRepository(session)
    row = repo.get_session(session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="paper session not found")

    # Capture persisted state before the generator runs (session closes after return).
    equity_data = [{"ts": e.ts.isoformat(), "equity": e.equity} for e in repo.list_equity(session_id)]
    trades_by_ts: dict[str, list] = {}
    for t in repo.list_trades(session_id):
        trades_by_ts.setdefault(t.ts.isoformat(), []).append(
            {"symbol": t.symbol, "units": t.units, "price": t.price}
        )
    sess_status = row.status

    async def generate():
        for e in equity_data:
            payload = {
                "type": "tick", "ts": e["ts"], "equity": e["equity"],
                "fills": trades_by_ts.get(e["ts"], []), "is_catchup": True,
            }
            yield f"event: tick\ndata: {json.dumps(payload)}\n\n"

        if sess_status in ("stopped", "error"):
            yield f"event: session_stopped\ndata: {json.dumps({'type': 'session_stopped', 'status': sess_status})}\n\n"
            return

        queue = events.get_queue(session_id)
        if queue is None:
            return
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=30.0)
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
                continue
            if item is None:
                break
            yield f"event: {item['type']}\ndata: {json.dumps(item)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

> Before implementing, open `src/hedgefund/api/db/repository.py` and confirm: (a) `BacktestRepository` exists with a `get(id)` method, (b) the column holding the strategy spec. If the spec column is not named `spec_json`, adjust `_lookup_backtest_spec` accordingly.

- [ ] **Step 4: Run tests to verify they pass**

First ensure the router is mounted (Task 14 Step 1). Then run:
`.venv/Scripts/python.exe -m pytest tests/api/test_paper_sessions.py -v`
Expected: PASS (6 tests). Requires Postgres.

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/routes/paper_sessions.py tests/api/test_paper_sessions.py
git commit -m "feat(paper): add paper session routes + SSE"
```

---

## Task 14: App wiring (router + startup ticker)

**Files:**
- Modify: `src/hedgefund/api/app.py`
- Create/Modify: `tests/api/conftest.py`

The ticker starts on app startup unless disabled (so tests stay deterministic). On startup the ticker simply resumes active sessions and backfills — there is NO stale-session cleanup (paper sessions survive restarts, unlike agent runs).

- [ ] **Step 1: Include the router**

In `src/hedgefund/api/app.py`, import and include the paper router next to the agent router:

```python
from hedgefund.api.routes.paper_sessions import router as paper_sessions_router
# ...
app.include_router(paper_sessions_router)
```

- [ ] **Step 2: Guard the ticker in tests**

Create or edit `tests/api/conftest.py` so importing the app never spawns the loop. Put this BEFORE any import of `hedgefund.api.app`:

```python
import os

os.environ.setdefault("PAPER_TICKER_ENABLED", "0")
```

(If `tests/api/conftest.py` already exists, add the two lines at the very top. Also ensure the shared `db_session` fixture lives here if it is used by `test_paper_sessions.py`.)

- [ ] **Step 3: Add the startup ticker task (guarded)**

Add a startup hook in `app.py`. Guard with the env flag:

```python
import asyncio
import os

from hedgefund.api import events
from hedgefund.api.config import get_settings
from hedgefund.api.db.engine import SessionLocal
from hedgefund.api.paper_panel import get_paper_panel_loader
from hedgefund.paper import ticker as paper_ticker


@app.on_event("startup")
async def _start_paper_ticker() -> None:
    if os.environ.get("PAPER_TICKER_ENABLED", "1") != "1":
        return
    settings = get_settings()
    loader = get_paper_panel_loader()

    def publish_for(session_id):
        events.create_queue(session_id)  # idempotent: ensure a queue exists for resumed sessions

        def _publish(ev: dict) -> None:
            q = events.get_queue(session_id)
            if q is not None:
                q.put_nowait(ev)

        return _publish

    asyncio.create_task(
        paper_ticker.ticker_loop(
            session_factory=SessionLocal,
            panel_loader=loader,
            publish_for=publish_for,
            interval_seconds=settings.paper_tick_interval_seconds,
            lookback_bars=settings.paper_fetch_lookback_bars,
        )
    )
```

> Confirm `events.create_queue` is idempotent (returns the existing queue if the id is already registered). If not, edit `events.py` so `create_queue` returns the existing queue when present rather than overwriting it.

- [ ] **Step 4: Run the API + paper suite to verify nothing regressed**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_paper_sessions.py tests/api/test_agent_runs.py -v`
Expected: PASS (ticker not started because conftest sets `PAPER_TICKER_ENABLED=0`).

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/app.py tests/api/conftest.py
git commit -m "feat(paper): wire paper router + guarded startup ticker"
```

---

## Task 15: Frontend — types + API client + SSE hook

**Files:**
- Modify: `dashboard/src/types.ts`
- Create: `dashboard/src/api/paperSessions.ts` (+ `.test.ts`)

- [ ] **Step 1: Add types**

Append to `dashboard/src/types.ts`:

```typescript
export interface PaperSessionSummary {
  id: string
  label: string
  source_backtest_id: string | null
  universe: string[]
  timeframe: string
  starting_cash: number
  status: 'active' | 'stopped' | 'error'
  last_processed_ts: string | null
  error: string | null
  created_at: string
  stopped_at: string | null
}

export interface PaperTrade { ts: string; symbol: string; units: number; price: number; is_catchup: boolean }
export interface PaperEquityPoint { ts: string; equity: number }

export interface PaperSessionDetail extends PaperSessionSummary {
  spec_json: Record<string, unknown>
  equity: PaperEquityPoint[]
  trades: PaperTrade[]
}

export interface CreatePaperSessionRequest {
  label: string
  source_backtest_id?: string | null
  spec_json?: Record<string, unknown> | null
  starting_cash: number
}

export type PaperSSEEvent =
  | { type: 'tick'; ts: string; equity: number; cash?: number; positions?: Record<string, number>; fills: { symbol: string; units: number; price: number }[]; is_catchup: boolean }
  | { type: 'session_stopped'; status: string; final_equity?: number }
  | { type: 'session_error'; error: string }
```

- [ ] **Step 2: Write the failing test for the client**

Create `dashboard/src/api/paperSessions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPaperSessions, createPaperSession } from './paperSessions'

beforeEach(() => { vi.restoreAllMocks() })

describe('paperSessions api', () => {
  it('listPaperSessions GETs the collection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)
    await listPaperSessions()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/paper-sessions'))
  })

  it('createPaperSession POSTs the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: '1' }) })
    vi.stubGlobal('fetch', fetchMock)
    await createPaperSession({ label: 't', spec_json: { name: 'x' }, starting_cash: 1000 })
    const [, opts] = fetchMock.mock.calls[0]
    expect(opts.method).toBe('POST')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd dashboard && npm run test -- --run src/api/paperSessions.test.ts`
Expected: FAIL — cannot resolve `./paperSessions`.

- [ ] **Step 4: Implement the client + hook**

Create `dashboard/src/api/paperSessions.ts` (mirror `agentRuns.ts`; open it and copy its exact base-url handling — replace `BASE` below if `agentRuns.ts` uses an `API_BASE` constant):

```typescript
import { useEffect, useState } from 'react'
import type {
  CreatePaperSessionRequest,
  PaperSessionDetail,
  PaperSessionSummary,
  PaperSSEEvent,
} from '../types'

const BASE = '/paper-sessions'  // match agentRuns.ts base-url handling

export async function listPaperSessions(): Promise<PaperSessionSummary[]> {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error(`listPaperSessions failed: ${res.status}`)
  return res.json()
}

export async function getPaperSession(id: string): Promise<PaperSessionDetail> {
  const res = await fetch(`${BASE}/${id}`)
  if (!res.ok) throw new Error(`getPaperSession failed: ${res.status}`)
  return res.json()
}

export async function createPaperSession(
  body: CreatePaperSessionRequest
): Promise<PaperSessionSummary> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`createPaperSession failed: ${res.status}`)
  return res.json()
}

export async function stopPaperSession(id: string): Promise<PaperSessionSummary> {
  const res = await fetch(`${BASE}/${id}/stop`, { method: 'POST' })
  if (!res.ok) throw new Error(`stopPaperSession failed: ${res.status}`)
  return res.json()
}

export function usePaperSessionEvents(sessionId: string | undefined): {
  events: PaperSSEEvent[]
  connected: boolean
} {
  const [events, setEvents] = useState<PaperSSEEvent[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    const es = new EventSource(`${BASE}/${sessionId}/events`)
    setConnected(true)
    const onTick = (e: MessageEvent) => setEvents((prev) => [...prev, JSON.parse(e.data)])
    const onStopped = (e: MessageEvent) => {
      setEvents((prev) => [...prev, JSON.parse(e.data)])
      es.close()
      setConnected(false)
    }
    es.addEventListener('tick', onTick)
    es.addEventListener('session_stopped', onStopped)
    es.addEventListener('session_error', onStopped)
    es.onerror = () => { es.close(); setConnected(false) }
    return () => { es.close(); setConnected(false) }
  }, [sessionId])

  return { events, connected }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd dashboard && npm run test -- --run src/api/paperSessions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/types.ts dashboard/src/api/paperSessions.ts dashboard/src/api/paperSessions.test.ts
git commit -m "feat(paper): add dashboard types, API client, SSE hook"
```

---

## Task 16: Frontend — presentational components

**Files:**
- Create: `dashboard/src/components/PaperSessionCard.tsx` (+ `.test.tsx`)
- Create: `dashboard/src/components/HoldingsTable.tsx` (+ `.test.tsx`)
- Create: `dashboard/src/components/LiveTradeFeed.tsx` (+ `.test.tsx`)
- Modify: `dashboard/src/styles/global.css`

- [ ] **Step 1: Write failing tests**

Create `dashboard/src/components/PaperSessionCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PaperSessionCard } from './PaperSessionCard'

const session = {
  id: 'abc', label: 'My BTC momentum', source_backtest_id: null,
  universe: ['BTC/USDT'], timeframe: '1h', starting_cash: 10000,
  status: 'active' as const, last_processed_ts: null, error: null,
  created_at: '2026-06-17T00:00:00Z', stopped_at: null,
}

describe('PaperSessionCard', () => {
  it('shows label and status', () => {
    render(<MemoryRouter><PaperSessionCard session={session} /></MemoryRouter>)
    expect(screen.getByText('My BTC momentum')).toBeInTheDocument()
    expect(screen.getByText(/active/i)).toBeInTheDocument()
  })
})
```

Create `dashboard/src/components/HoldingsTable.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HoldingsTable } from './HoldingsTable'

describe('HoldingsTable', () => {
  it('renders a row per position', () => {
    render(<HoldingsTable positions={{ 'BTC/USDT': 0.5, 'ETH/USDT': 2 }} />)
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
    expect(screen.getByText('ETH/USDT')).toBeInTheDocument()
  })

  it('shows empty state when flat', () => {
    render(<HoldingsTable positions={{}} />)
    expect(screen.getByText(/no open positions/i)).toBeInTheDocument()
  })
})
```

Create `dashboard/src/components/LiveTradeFeed.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiveTradeFeed } from './LiveTradeFeed'

describe('LiveTradeFeed', () => {
  it('renders fills and tags catch-up rows', () => {
    render(<LiveTradeFeed trades={[
      { ts: '2026-06-17T01:00:00Z', symbol: 'BTC/USDT', units: 0.1, price: 100, is_catchup: true },
    ]} />)
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
    expect(screen.getByText(/catch-up/i)).toBeInTheDocument()
  })

  it('shows empty state with no trades', () => {
    render(<LiveTradeFeed trades={[]} />)
    expect(screen.getByText(/no trades yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard && npm run test -- --run src/components/PaperSessionCard.test.tsx src/components/HoldingsTable.test.tsx src/components/LiveTradeFeed.test.tsx`
Expected: FAIL — modules cannot be resolved.

- [ ] **Step 3: Implement the components**

Create `dashboard/src/components/PaperSessionCard.tsx`:

```tsx
import { Link } from 'react-router-dom'
import type { PaperSessionSummary } from '../types'

type Props = { session: PaperSessionSummary }

export function PaperSessionCard({ session }: Props) {
  return (
    <Link to={`/paper/sessions/${session.id}`} className="paper-session-card">
      <div className="paper-session-label">{session.label}</div>
      <div className="paper-session-meta">
        <span className={`status-badge status-${session.status}`}>{session.status}</span>
        <span className="paper-session-universe">{session.universe.join(', ')}</span>
      </div>
    </Link>
  )
}
```

Create `dashboard/src/components/HoldingsTable.tsx`:

```tsx
type Props = { positions: Record<string, number> }

export function HoldingsTable({ positions }: Props) {
  const entries = Object.entries(positions)
  if (entries.length === 0) return <p className="muted">No open positions.</p>
  return (
    <table className="holdings-table">
      <thead><tr><th>Symbol</th><th>Units</th></tr></thead>
      <tbody>
        {entries.map(([symbol, units]) => (
          <tr key={symbol}><td>{symbol}</td><td>{units.toFixed(6)}</td></tr>
        ))}
      </tbody>
    </table>
  )
}
```

Create `dashboard/src/components/LiveTradeFeed.tsx`:

```tsx
import type { PaperTrade } from '../types'

type Props = { trades: PaperTrade[] }

export function LiveTradeFeed({ trades }: Props) {
  if (trades.length === 0) return <p className="muted">No trades yet.</p>
  return (
    <ul className="live-trade-feed">
      {trades.map((t, i) => (
        <li key={`${t.ts}-${t.symbol}-${i}`} className="trade-row">
          <span className="trade-ts">{new Date(t.ts).toLocaleString()}</span>
          <span className="trade-symbol">{t.symbol}</span>
          <span className={t.units >= 0 ? 'pos' : 'neg'}>
            {t.units >= 0 ? 'BUY' : 'SELL'} {Math.abs(t.units).toFixed(6)} @ {t.price}
          </span>
          {t.is_catchup && <span className="badge-catchup">catch-up</span>}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Add styles**

Append to `dashboard/src/styles/global.css`:

```css
.paper-session-card { display: block; padding: 1rem; border: 1px solid var(--border, #2a2a2a);
  border-radius: 8px; text-decoration: none; color: inherit; }
.paper-session-card:hover { border-color: var(--accent, #4c8bf5); }
.paper-session-label { font-weight: 600; margin-bottom: 0.4rem; }
.paper-session-meta { display: flex; gap: 0.6rem; align-items: center; font-size: 0.85rem; }
.status-badge.status-active { color: #2ecc71; }
.status-badge.status-stopped { color: #888; }
.status-badge.status-error { color: #e74c3c; }
.holdings-table { width: 100%; border-collapse: collapse; }
.holdings-table th, .holdings-table td { text-align: left; padding: 0.3rem 0.5rem;
  border-bottom: 1px solid var(--border, #2a2a2a); }
.live-trade-feed { list-style: none; padding: 0; margin: 0; }
.trade-row { display: flex; gap: 0.6rem; align-items: center; padding: 0.3rem 0;
  border-bottom: 1px solid var(--border, #2a2a2a); font-size: 0.85rem; }
.badge-catchup { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 4px;
  background: #444; color: #ddd; }
.pos { color: #2ecc71; } .neg { color: #e74c3c; } .muted { color: #888; }
.paper-sessions-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd dashboard && npm run test -- --run src/components/PaperSessionCard.test.tsx src/components/HoldingsTable.test.tsx src/components/LiveTradeFeed.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/PaperSessionCard.tsx dashboard/src/components/PaperSessionCard.test.tsx dashboard/src/components/HoldingsTable.tsx dashboard/src/components/HoldingsTable.test.tsx dashboard/src/components/LiveTradeFeed.tsx dashboard/src/components/LiveTradeFeed.test.tsx dashboard/src/styles/global.css
git commit -m "feat(paper): add paper UI presentational components"
```

---

## Task 17: Frontend — pages

**Files:**
- Create: `dashboard/src/pages/PaperStartPage.tsx` (+ `.test.tsx`)
- Create: `dashboard/src/pages/PaperLivePage.tsx` (+ `.test.tsx`)
- Create: `dashboard/src/pages/PaperHistoryPage.tsx` (+ `.test.tsx`)

- [ ] **Step 1: Write failing tests**

Create `dashboard/src/pages/PaperHistoryPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PaperHistoryPage } from './PaperHistoryPage'

vi.mock('../api/paperSessions', () => ({ listPaperSessions: vi.fn().mockResolvedValue([]) }))

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PaperHistoryPage', () => {
  it('shows empty state', async () => {
    wrap(<PaperHistoryPage />)
    expect(await screen.findByText(/no paper sessions yet/i)).toBeInTheDocument()
  })
})
```

Create `dashboard/src/pages/PaperStartPage.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PaperStartPage } from './PaperStartPage'

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PaperStartPage', () => {
  it('renders the form with a launch button', () => {
    wrap(<PaperStartPage />)
    expect(screen.getByRole('heading', { name: /start paper session/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /launch/i })).toBeInTheDocument()
  })
})
```

Create `dashboard/src/pages/PaperLivePage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PaperLivePage } from './PaperLivePage'

vi.mock('../api/paperSessions', () => ({
  getPaperSession: vi.fn().mockResolvedValue({
    id: 'abc', label: 'live btc', source_backtest_id: null, universe: ['BTC/USDT'],
    timeframe: '1h', starting_cash: 10000, status: 'active', last_processed_ts: null,
    error: null, created_at: '2026-06-17T00:00:00Z', stopped_at: null,
    spec_json: { name: 'x' }, equity: [], trades: [],
  }),
  usePaperSessionEvents: vi.fn().mockReturnValue({ events: [], connected: true }),
  stopPaperSession: vi.fn(),
}))

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/paper/sessions/abc']}>
        <Routes><Route path="/paper/sessions/:id" element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PaperLivePage', () => {
  it('renders the session label from query', async () => {
    wrap(<PaperLivePage />)
    expect(await screen.findByText('live btc')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard && npm run test -- --run src/pages/PaperHistoryPage.test.tsx src/pages/PaperStartPage.test.tsx src/pages/PaperLivePage.test.tsx`
Expected: FAIL — modules cannot be resolved.

- [ ] **Step 3: Implement `PaperHistoryPage`**

Create `dashboard/src/pages/PaperHistoryPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { listPaperSessions } from '../api/paperSessions'
import { PaperSessionCard } from '../components/PaperSessionCard'

export function PaperHistoryPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['paper-sessions'],
    queryFn: listPaperSessions,
  })
  if (isLoading) return <p>Loading…</p>
  if (isError) return <p className="neg">{(error as Error).message}</p>
  const sessions = data ?? []
  if (sessions.length === 0) return <p>No paper sessions yet — go to Paper Trading to start one.</p>
  return (
    <div>
      <h2>Paper Sessions</h2>
      <div className="paper-sessions-grid">
        {sessions.map((s) => <PaperSessionCard key={s.id} session={s} />)}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `PaperStartPage`**

Create `dashboard/src/pages/PaperStartPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createPaperSession } from '../api/paperSessions'
import type { CreatePaperSessionRequest } from '../types'

export function PaperStartPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefillBacktestId = params.get('source_backtest_id')

  const [label, setLabel] = useState('')
  const [specText, setSpecText] = useState('')
  const [startingCash, setStartingCash] = useState(10000)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setPending(true)
    setError(null)
    const body: CreatePaperSessionRequest = prefillBacktestId
      ? { label, source_backtest_id: prefillBacktestId, starting_cash: startingCash }
      : { label, spec_json: safeParse(specText), starting_cash: startingCash }
    try {
      const session = await createPaperSession(body)
      navigate(`/paper/sessions/${session.id}`)
    } catch (err) {
      setError((err as Error).message)
      setPending(false)
    }
  }

  return (
    <div>
      <h2>Start Paper Session</h2>
      {prefillBacktestId && <p className="muted">From backtest {prefillBacktestId}</p>}
      {error && <p className="neg" role="alert">{error}</p>}
      <form className="paper-form" onSubmit={handleSubmit}>
        <label>Label
          <input aria-label="Label" value={label} onChange={(e) => setLabel(e.target.value)} required />
        </label>
        {!prefillBacktestId && (
          <label>Strategy spec (JSON)
            <textarea aria-label="Strategy spec JSON" value={specText}
              onChange={(e) => setSpecText(e.target.value)}
              placeholder='{"name": "...", "universe": ["BTC/USDT"], ...}' />
          </label>
        )}
        <label>Starting cash ($)
          <input type="number" value={startingCash}
            onChange={(e) => setStartingCash(Number(e.target.value))} />
        </label>
        <button type="submit" className="primary" disabled={pending || !label.trim()}>
          {pending ? 'Launching…' : 'Launch'}
        </button>
      </form>
    </div>
  )
}

function safeParse(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) } catch { return null }
}
```

- [ ] **Step 5: Implement `PaperLivePage`**

Create `dashboard/src/pages/PaperLivePage.tsx`:

```tsx
import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPaperSession, usePaperSessionEvents, stopPaperSession } from '../api/paperSessions'
import { HoldingsTable } from '../components/HoldingsTable'
import { LiveTradeFeed } from '../components/LiveTradeFeed'
import type { PaperSSEEvent, PaperTrade } from '../types'

export function PaperLivePage() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useQuery({
    queryKey: ['paper-sessions', id],
    queryFn: () => getPaperSession(id!),
    enabled: !!id,
  })
  const { events, connected } = usePaperSessionEvents(id)

  const ticks = useMemo(
    () => events.filter((e): e is Extract<PaperSSEEvent, { type: 'tick' }> => e.type === 'tick'),
    [events]
  )
  const latest = ticks[ticks.length - 1]
  const positions = latest?.positions ?? {}
  const equity =
    latest?.equity ??
    session?.equity[session.equity.length - 1]?.equity ??
    session?.starting_cash ??
    0

  const liveTrades: PaperTrade[] = ticks.flatMap((t) =>
    t.fills.map((f) => ({ ts: t.ts, symbol: f.symbol, units: f.units, price: f.price, is_catchup: t.is_catchup }))
  )
  const allTrades = [...(session?.trades ?? []), ...liveTrades]

  const pctReturn = session ? ((equity - session.starting_cash) / session.starting_cash) * 100 : 0

  return (
    <div>
      <div className="paper-live-header">
        <h2>{session?.label ?? 'Paper Session'}</h2>
        <div>
          <span className={`status-badge status-${session?.status ?? 'active'}`}>
            {session?.status ?? '…'}
          </span>
          {connected && <span className="muted"> · streaming…</span>}
        </div>
        <div className="paper-live-equity">
          ${equity.toFixed(2)}{' '}
          <span className={pctReturn >= 0 ? 'pos' : 'neg'}>({pctReturn.toFixed(2)}%)</span>
          <span className="muted"> from ${session?.starting_cash?.toFixed(2)}</span>
        </div>
        {session?.status === 'active' && (
          <button onClick={() => id && stopPaperSession(id)}>Stop</button>
        )}
      </div>

      <h3>Holdings</h3>
      <HoldingsTable positions={positions} />

      <h3>Trades</h3>
      <LiveTradeFeed trades={allTrades} />
    </div>
  )
}
```

> The equity-curve chart is intentionally omitted from the test path. After tests pass, add it by reusing the existing chart component from `ResultPage.tsx`, binding it to `[...session.equity, ...ticks.map(t => ({ ts: t.ts, equity: t.equity }))]`. Keeping it out of the test avoids coupling the test to chart internals.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd dashboard && npm run test -- --run src/pages/PaperHistoryPage.test.tsx src/pages/PaperStartPage.test.tsx src/pages/PaperLivePage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/pages/PaperStartPage.tsx dashboard/src/pages/PaperStartPage.test.tsx dashboard/src/pages/PaperLivePage.tsx dashboard/src/pages/PaperLivePage.test.tsx dashboard/src/pages/PaperHistoryPage.tsx dashboard/src/pages/PaperHistoryPage.test.tsx
git commit -m "feat(paper): add paper start/live/history pages"
```

---

## Task 18: Frontend — routing, nav, ResultPage button

**Files:**
- Modify: `dashboard/src/App.tsx`
- Modify: `dashboard/src/components/NavBar.tsx`
- Modify: `dashboard/src/pages/ResultPage.tsx`

- [ ] **Step 1: Add routes**

In `dashboard/src/App.tsx`, import the three pages and add routes inside `<Routes>`:

```tsx
import { PaperStartPage } from './pages/PaperStartPage'
import { PaperLivePage } from './pages/PaperLivePage'
import { PaperHistoryPage } from './pages/PaperHistoryPage'
// ...
<Route path="/paper" element={<PaperStartPage />} />
<Route path="/paper/sessions/:id" element={<PaperLivePage />} />
<Route path="/paper/history" element={<PaperHistoryPage />} />
```

- [ ] **Step 2: Add nav links**

In `dashboard/src/components/NavBar.tsx`, add after the existing links:

```tsx
<NavLink to="/paper">Paper Trading</NavLink>
<NavLink to="/paper/history">Paper History</NavLink>
```

- [ ] **Step 3: Add "Paper trade this →" button to ResultPage**

In `dashboard/src/pages/ResultPage.tsx`, add a link near the result header (use the result's backtest id — confirm the variable name in the file; it is likely `id` from `useParams`):

```tsx
import { Link } from 'react-router-dom'
// within the rendered header, where `id` is the backtest id:
<Link className="primary" to={`/paper?source_backtest_id=${id}`}>Paper trade this →</Link>
```

- [ ] **Step 4: Run the full dashboard suite**

Run: `cd dashboard && npm run test -- --run`
Expected: PASS (all prior tests + new paper tests).

- [ ] **Step 5: Build the dashboard**

Run: `cd dashboard && npm run build`
Expected: `tsc -b && vite build` completes with no type errors.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/App.tsx dashboard/src/components/NavBar.tsx dashboard/src/pages/ResultPage.tsx
git commit -m "feat(paper): wire paper routes, nav, and ResultPage launch button"
```

---

## Task 19: Full verification + docs

**Files:**
- Modify: `.env.example` (if present)
- Modify: `README.md` (if it documents surfaces)

- [ ] **Step 1: Run the full Python pure-logic suite**

Run: `.venv/Scripts/python.exe -m pytest tests/paper/ tests/data/test_fetch.py -v`
Expected: PASS (all paper engine/state/ticker/resume/service/panel + fetch tests).

- [ ] **Step 2: Run DB-dependent suite (Postgres up)**

Run: `docker compose up -d db && .venv/Scripts/python.exe -m alembic upgrade head && .venv/Scripts/python.exe -m pytest tests/api/test_paper_repository.py tests/api/test_paper_sessions.py tests/api/test_paper_schemas.py tests/api/test_paper_config.py -v`
Expected: PASS. If Postgres is unavailable, record that these are pending DB availability.

- [ ] **Step 3: Run the full dashboard suite + build**

Run: `cd dashboard && npm run test -- --run && npm run build`
Expected: all tests green; build clean.

- [ ] **Step 4: Document config**

If `.env.example` exists, add:

```
PAPER_TICK_INTERVAL_SECONDS=60
PAPER_FETCH_LOOKBACK_BARS=1000
PAPER_TICKER_ENABLED=1
```

If `README.md` lists surfaces, add a short "Surface D: Live Paper Trading" section describing: start from a winning backtest or a pasted spec, hourly ticks, restart backfill, multiple concurrent sessions.

- [ ] **Step 5: Final commit**

```bash
git add .env.example README.md
git commit -m "docs(paper): document Surface D config and usage"
```

---

## Self-Review (completed during planning)

**1. Spec coverage:**
- Purpose / forward step reusing engine → Tasks 2, 3, 9.
- Hourly cadence + backfill = same path → Task 8 (`catch_up_session` high-water mark).
- Restart resume, no cleanup → Task 14 (guarded startup, no stale-marking).
- Multiple concurrent sessions + shared fetch → Task 8 (`run_ticker_cycle` grouping).
- Launch from winner OR spec → Tasks 10 (`resolve_spec`), 13 (routes), 17/18 (UI + ResultPage button).
- Three tables → Tasks 4, 5; repository → Task 6.
- SSE reuse of events.py → Task 13; live UI → Tasks 15–17.
- Timeframe-aware fetch → Task 1.
- Error handling (fetch failure, error isolation, stop mid-backfill, high-water dedup) → Tasks 8, 13.
- Config → Task 12; testing coverage → every task is TDD; dashboard tests → Tasks 15–17.

**2. Placeholder scan:** No "TBD / handle edge cases" placeholders. Three explicit "confirm in file" notes (BacktestRepository column name in Task 13; `events.create_queue` idempotency in Task 14; chart component reuse in Task 17) are verification instructions with concrete fallbacks, not deferred work.

**3. Type consistency:** `PaperState` fields identical across Tasks 2/3/8/9. `step(spec, state, panel, indicators, ts)` signature consistent (Tasks 3, 8, 9). `Fill(symbol, units, price)` consistent. Repository method names (`create_session`, `list_active_sessions`, `record_tick`, `stop_session`, `set_error`, `get_status`, `list_trades`, `list_equity`) match between Tasks 6, 8, 13. Schema field names match routes (Task 11 ↔ 13). TS types (`PaperSessionSummary`, `PaperSessionDetail`, `PaperSSEEvent`) match client + pages (Tasks 15–17).

**Known cross-task ordering dependency:** Task 13's route tests require the router mounted (Task 14 Step 1). Flagged in both Task 13 and Task 14.
