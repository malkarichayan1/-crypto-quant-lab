# Surface D: Live Paper Trading — Design Spec

**Date:** 2026-06-17
**Project:** AI Crypto Hedge Fund Simulator
**Slice:** 4 of 4 (surface D — live forward paper trading)

---

## 1. Purpose

Run a `StrategySpec` *forward* against live exchange data with simulated money,
recording trades and an equity curve so the user can validate a strategy in real
market conditions before ever risking real capital. A session is launched from a
winning agent-run backtest or from a hand-authored spec, ticks hourly, survives
machine restarts by backfilling missed candles, and supports multiple concurrent
sessions for live side-by-side comparison.

### Success criteria

- `POST /paper-sessions` launches a live session (from `source_backtest_id` or a
  pasted `spec_json`) and returns the session record (201).
- A shared in-process async ticker advances every `active` session once per closed
  hourly candle, reusing the existing backtest engine for the forward step.
- On restart, each `active` session resumes from its persisted high-water mark and
  backfills missed candles through the same step path — no double-fills.
- `GET /paper-sessions/{id}/events` (SSE) streams ticks live; reconnect replays
  persisted equity + trades, then reattaches to the live queue.
- Multiple sessions run concurrently; sessions sharing symbols/timeframe share one
  data fetch per cycle.
- A paper session over a given period behaves identically to a backtest of the same
  spec/period (same decide-on-close / fill-next-open semantics).
- 80%+ coverage on `hedgefund/paper/` and the new route/schema code; all exchange
  fetches mocked in tests.

---

## 2. Scope

### In scope

- New package `src/hedgefund/paper/` — resumable `PaperState`, pure `step()` engine,
  shared async `ticker`, and a `service` for session lifecycle.
- Targeted change to `data/fetch.py` to make it timeframe-aware (currently daily-only).
- Persistence: three new tables (`paper_sessions`, `paper_trades`, `paper_equity`).
- Streaming: SSE endpoint reusing the existing `events.py` per-id `asyncio.Queue` bus.
- React pages: start form, live session page, session history; "Paper trade this →"
  deep link from the existing Result page.
- Hourly tick cadence; backfill of missed candles on restart; multiple concurrent
  sessions.

### Explicitly out of scope

- Real-money / real-exchange order submission. Simulated fills only.
- Multi-user / authentication.
- Configurable-per-session timeframe — sessions are `"1h"`; the fetch layer is made
  timeframe-aware but the UI fixes `1h` for this slice.
- Intra-candle / streaming-tick execution — decisions happen at candle close only.
- Editing a running session's spec or parameters. Stop and start a new one instead.
- Alerts / notifications on fills (possible future surface).

---

## 3. Architecture

### Approach: single in-process async ticker (Approach A)

One background `asyncio` task starts with the FastAPI app (same pattern as the agent
runner). It wakes on a short check interval and, for each `active` session, processes
every hourly candle that has closed since the session's `last_processed_ts`. A normal
live tick is the 1-candle case of the same loop that performs restart backfill.

```
src/hedgefund/
  paper/
    __init__.py
    state.py        # PaperState dataclass: resumable runtime state
    engine.py       # step(): advance ONE session by ONE candle (reuses engine/*)
    ticker.py       # shared async catch-up loop over all active sessions
    service.py      # session lifecycle: start, stop, snapshot; wraps repo + ticker
  data/
    fetch.py        # MODIFIED: timeframe-aware fetch_ohlcv / fetch_ohlcv_paginated
  api/
    db/
      paper_models.py      # PaperSessionRow, PaperTradeRow, PaperEquityRow
      paper_repository.py  # PaperRepository
    paper_schemas.py       # Pydantic request/response
    routes/
      paper_sessions.py    # /paper-sessions routes + SSE live endpoint
    events.py              # REUSED — same per-id asyncio.Queue bus as agent runs
migrations/
  versions/
    0003_add_paper_tables.py
```

The existing `backtests` and `agent_runs` routes, models, and repositories are
**untouched**. Paper sessions reference a backtest only via the nullable
`source_backtest_id`.

### Reuse of the existing engine

The backtest loop in `engine/backtest.py` decides a target on bar `t`'s close and
fills it at bar `t+1`'s open (deliberate one-bar execution lag). The forward step
replicates exactly one iteration of that loop, persisting between calls the state
that the backtest holds in locals:

- `pf` (cash + positions) → `PaperState.cash` / `PaperState.positions`
- `pending_target` (target decided last bar, filled this bar) → `PaperState.pending_target`
- `ts_state` (indicator time-series carry) → `PaperState.ts_state`
- `prev_t` → `PaperState.prev_ts`

`step()` reuses `compute_all`, `target_weights`, and `rebalance_to_weights` directly,
so no strategy math is reimplemented and live matches backtest by construction.

### PaperState

```python
@dataclass
class PaperState:
    cash: float
    positions: dict[str, float]              # symbol -> units
    pending_target: dict[str, float] | None  # target decided last tick, fills this tick
    ts_state: dict[str, bool]                # indicator time-series state across bars
    prev_ts: str | None                      # ISO timestamp of last marked bar
    last_processed_ts: str | None            # ISO ts of last candle handled -> backfill driver
```

All fields are JSON-serializable (persisted in `paper_sessions.state_json`).

### engine.step signature

```python
def step(
    spec: StrategySpec,
    state: PaperState,
    panel,            # Panel with data up to and including `ts`
    ts: pd.Timestamp,
) -> tuple[PaperState, list[Fill], float]:
    """Advance one session by one candle. Returns (new_state, fills, equity_at_ts).
    Pure: no DB, no network. Mirrors one iteration of run_backtest's loop."""
```

`Fill` is a small dataclass: `symbol: str`, `units: float` (signed), `price: float`.

### Ticker loop

```
every CHECK_INTERVAL (default 60s):
  active = repo.list_active_sessions()
  if not active: sleep; continue
  group sessions by (frozenset(universe), timeframe)
  for each group: fetch ONE panel up to now (timeframe-aware)
  for each session:
     state = deserialize(session.state_json)
     candles = [ts for ts in panel.index if ts > state.last_processed_ts]
     for ts in candles:
         if repo.get_status(session.id) != "active": break   # stop honored mid-backfill
         new_state, fills, equity_pt = engine.step(spec, state, panel.slice_through(ts), ts)
         new_state.last_processed_ts = ts.isoformat()
         repo.record_tick(session.id, new_state, fills, equity_pt, ts, is_catchup=<replay>)
         events.publish(session.id, tick_event)
         state = new_state
```

- **Backfill = normal ticking.** `ts > last_processed_ts` yields missed candles on
  restart and the single new candle in steady state.
- **`is_catchup`** is true when more than one candle is processed in a cycle (restart
  replay) so the UI can tag offline-window fills.
- **Shared fetch.** Grouping by `(universe, timeframe)` means concurrent sessions on
  the same symbols fetch once per cycle.
- **Crash-safe.** State is persisted after each candle; a mid-backfill crash resumes
  from the last completed candle.
- **Check interval ≠ tick rate.** The ticker checks ~every 60s but only `step()`s
  when a new hourly candle has closed — at most ~1 min detection lag, no wall-clock
  alarm needed.

### Data flow end to end

`POST /paper-sessions` → row created `active` with initial `PaperState` (cash =
starting_cash, empty positions, `last_processed_ts = null`), queue registered →
ticker picks it up next cycle → each processed candle persists a tick and emits an
SSE event the live page consumes → `POST /paper-sessions/{id}/stop` flips status to
`stopped`; ticker skips it.

---

## 4. Fetch-Layer Change (data/fetch.py)

Currently `fetch_ohlcv` hardcodes `timeframe="1d"` and `fetch_ohlcv_paginated`
advances the cursor by `_DAY_MS`. Make both timeframe-aware:

- Add `timeframe: str = "1d"` parameter to `fetch_ohlcv` and `fetch_ohlcv_paginated`.
- Replace the `_DAY_MS` cursor step with a lookup:
  `_MS_PER_BAR = {"1m": 60_000, "15m": 900_000, "1h": 3_600_000, "1d": 86_400_000}`.
- `fetch_ohlcv` passes `timeframe` through to `exchange.fetch_ohlcv`.
- The paginator steps `cursor = last_ts + _MS_PER_BAR[timeframe]`.

Existing callers default to `"1d"` and behave exactly as before (regression-guarded
by test). No other behavior change.

---

## 5. Data Model

### `paper_sessions` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` PK | `uuid4()` server-side |
| `label` | `TEXT NOT NULL` | user-friendly name |
| `spec_json` | `JSONB NOT NULL` | the StrategySpec being traded |
| `source_backtest_id` | `UUID FK→backtests.id` | nullable; set when launched from a winner |
| `universe` | `JSONB NOT NULL` | symbols |
| `timeframe` | `TEXT NOT NULL` | `"1h"` |
| `starting_cash` | `DOUBLE PRECISION NOT NULL` | |
| `status` | `TEXT NOT NULL` | `active \| stopped \| error` |
| `state_json` | `JSONB NOT NULL` | the serialized `PaperState` (resume point) |
| `last_processed_ts` | `TIMESTAMPTZ` | nullable; high-water mark, mirrored from state for cheap querying |
| `error` | `TEXT` | nullable; last error message |
| `created_at` | `TIMESTAMPTZ NOT NULL` | server default |
| `stopped_at` | `TIMESTAMPTZ` | nullable |

### `paper_trades` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` PK | |
| `session_id` | `UUID FK→paper_sessions.id NOT NULL` | parent session |
| `ts` | `TIMESTAMPTZ NOT NULL` | candle timestamp of the fill |
| `symbol` | `TEXT NOT NULL` | |
| `units` | `DOUBLE PRECISION NOT NULL` | signed (+buy / -sell) |
| `price` | `DOUBLE PRECISION NOT NULL` | fill price (this bar's open) |
| `is_catchup` | `BOOLEAN NOT NULL DEFAULT FALSE` | filled during a backfill replay |

### `paper_equity` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` PK | |
| `session_id` | `UUID FK→paper_sessions.id NOT NULL` | parent session |
| `ts` | `TIMESTAMPTZ NOT NULL` | candle timestamp |
| `equity` | `DOUBLE PRECISION NOT NULL` | portfolio value marked at this bar's close |

One `paper_equity` row per processed candle; `paper_trades` rows only when fills occur.

---

## 6. API Surface

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/paper-sessions` | `CreatePaperSessionRequest` | `PaperSessionResponse` 201 |
| `GET` | `/paper-sessions` | — | `list[PaperSessionSummary]` 200 |
| `GET` | `/paper-sessions/{id}` | — | `PaperSessionDetail` 200/404 |
| `POST` | `/paper-sessions/{id}/stop` | — | `PaperSessionResponse` 200/404 |
| `GET` | `/paper-sessions/{id}/events` | — | SSE stream 200/404 |

### `CreatePaperSessionRequest`

- `label: str`
- exactly one of:
  - `source_backtest_id: UUID` — copy that backtest's spec, or
  - `spec_json: dict` — validated through the existing `StrategySpec` loader
- `starting_cash: float = 10_000.0`

`universe` and `timeframe` derive from the resolved spec; `timeframe` defaults to
`"1h"`. Validation: 422 if neither or both spec sources are provided, or if
`spec_json` fails `StrategySpec` validation, or `source_backtest_id` is unknown.

### `PaperSessionDetail`

Includes the session row fields plus the persisted `paper_equity` series and
`paper_trades` list (for chart + trade-feed replay on load).

### SSE event types (JSON `data:`, `event: <type>` prefix; same `events.py` bus)

- `session_started` — `{"id": "...", "label": "...", "status": "active"}`
- `tick` — `{"ts": "...", "equity": 10250.0, "cash": 1200.0, "positions": {...},
  "fills": [{"symbol": "...", "units": 0.3, "price": 51000.0}], "is_catchup": false}`
- `session_stopped` — `{"id": "...", "status": "stopped", "final_equity": 10840.0}`
- `session_error` — `{"id": "...", "error": "..."}`

The live endpoint replays persisted `paper_equity` + `paper_trades` as synthetic
`tick` events on connect, then reads the live queue until a sentinel — identical to
the agent-run SSE pattern.

---

## 7. Frontend

```
dashboard/src/
  api/
    paperSessions.ts        # fetch fns + usePaperSessionEvents SSE hook
  pages/
    PaperStartPage.tsx      # launch form -> POST -> navigate to live page
    PaperLivePage.tsx       # live equity curve + holdings + trade feed
    PaperHistoryPage.tsx    # list of all sessions
  components/
    PaperSessionCard.tsx    # summary card for history grid
    HoldingsTable.tsx       # current positions + market value
    LiveTradeFeed.tsx       # streaming fills; catch-up rows tagged
```

Modified:
- `App.tsx` — add `/paper`, `/paper/sessions/:id`, `/paper/history` routes.
- `NavBar.tsx` — add "Paper Trading" link.
- `ResultPage.tsx` — add a "Paper trade this →" button that deep-links to
  `/paper?source_backtest_id=<id>`.
- `global.css` — paper UI styles.

**PaperStartPage** — two launch modes mirroring the spec-source decision: "from
winning run" (prefilled when `source_backtest_id` is in the query string) and
"paste/select a spec". Plus `label` and `starting_cash`.

**PaperLivePage** — header (label, status badge, current equity vs starting cash,
% return); reuses the existing equity-curve chart component bound to `paper_equity`;
`HoldingsTable` for current positions; `LiveTradeFeed` appending fills via SSE with
catch-up fills visually tagged.

**PaperHistoryPage** — grid of `PaperSessionCard`, each linking to its live page.

The structure deliberately parallels the Research (agent) UI for consistency. No new
npm packages — SSE via native `EventSource`.

---

## 8. Error Handling & Edge Cases

- **Fetch failure on a cycle.** Log, leave `last_processed_ts` untouched, retry next
  cycle. Transient `ccxt` outages only delay ticks; backfill recovers them. State is
  never corrupted by a failed fetch.
- **Missing candle for a symbol at `ts`.** Reuse the engine's existing `is_tradable`
  guard; the session marks-to-market on available symbols and skips non-tradable ones.
- **Stale `active` sessions on restart.** Paper sessions are *meant* to survive
  restarts. On startup the ticker resumes every `active` session from its persisted
  `last_processed_ts` and backfills downtime. No startup cleanup (unlike agent runs,
  which are marked `failed`).
- **Spec references a symbol the exchange dropped.** Session transitions to `error`
  with a message, the ticker skips it, the UI shows an error badge; user stops it.
- **Stop during backfill.** `stop` sets status `stopped`; the ticker checks status
  before each candle, so an in-progress backfill halts cleanly at the next candle
  boundary.
- **Duplicate / overlapping cycles.** `last_processed_ts` is a high-water mark; only
  `ts > last_processed_ts` is processed, so overlapping cycles never double-fill.
- **Empty/short startup history.** A brand-new session with `last_processed_ts = null`
  processes all available candles in the first fetch window up to now; this is just a
  large first backfill.

---

## 9. Testing

Coverage target: 80%+ on `hedgefund/paper/` and `hedgefund/api/routes/paper_sessions.py`.

- **`tests/paper/test_engine.py`** — `step()` against fixture panels: pending target
  fills at next bar's open; mark-to-market at this bar's close; `ts_state` carries
  forward; empty `pending_target` is a no-op; equity equals `pf.value` at the bar.
  Pure, no I/O.
- **`tests/paper/test_ticker.py`** — fake panel + fake repo: one new candle → one
  tick; N missed candles → N replays in order tagged `is_catchup`; stop mid-backfill
  halts at the next candle; high-water mark prevents double-processing; shared fetch
  used once for two sessions sharing a universe.
- **`tests/paper/test_resume.py`** — serialize `PaperState` → reconstruct → assert an
  identical continuation vs an uninterrupted run (crash-safe resume equivalence).
- **`tests/data/test_fetch.py`** — extend: `timeframe="1h"` steps the cursor by
  3_600_000 ms and passes `"1h"` to the exchange; `"1d"` path unchanged (regression
  guard).
- **`tests/api/test_paper_sessions.py`** — FastAPI TestClient, ticker disabled: POST
  from `source_backtest_id`, POST from `spec_json`, 422 when neither/both provided,
  422 on invalid spec, list, get, stop, 404 paths.
- **Dashboard:** `PaperSessionCard.test.tsx`, `HoldingsTable.test.tsx`,
  `LiveTradeFeed.test.tsx`, `PaperHistoryPage.test.tsx` (mocked TanStack Query),
  `PaperLivePage.test.tsx` (mocked `usePaperSessionEvents`).

All exchange access is injected (a fake ccxt exchange / fake panel), so no test hits
the network.

---

## 10. Dependencies & Configuration

- **No new Python or npm packages.** Reuses `ccxt`, FastAPI, SQLAlchemy, the engine,
  and native `EventSource`.
- **Config (`api/config.py`):**
  - `PAPER_TICK_INTERVAL_SECONDS` — optional; default `60`. Ticker check interval.
  - `PAPER_FETCH_LOOKBACK_BARS` — optional; default large enough to warm indicators
    (e.g. `1000`) so a fresh session has history for indicator computation.
- Startup hook in `app.py` launches the single ticker task (guarded so tests can skip
  it via dependency/flag).

---

## 11. Risks & Mitigations

- **Indicator warm-up.** A strategy with a 50-bar indicator needs ≥50 prior candles
  before its first valid signal. Mitigation: the first fetch pulls
  `PAPER_FETCH_LOOKBACK_BARS` of history; `ts_state`/indicator NaNs early are handled
  by the existing engine exactly as in a backtest.
- **Long offline backfill.** Days offline → many hourly candles to replay. Bounded by
  the fetch `limit` pagination already in `fetch_ohlcv_paginated`; replay is pure CPU
  and fast. Persisted per-candle so it is resumable.
- **Ticker exception kills all sessions.** Wrap each session's processing in
  try/except inside the loop; one session's error sets only that session to `error`
  and never aborts the shared ticker.
- **Exchange rate limits.** Shared fetch per `(universe, timeframe)` per cycle and the
  existing retry/backoff in `fetch_ohlcv` keep request volume low.
- **SSE queue leak.** Same mitigation as agent runs: sentinel on stop/error, route
  removes the queue entry; resumable sessions re-register a queue on next tick.
- **Clock skew between check interval and candle close.** Detection lag is bounded by
  the check interval (~60s); irrelevant to correctness because fills use candle
  open/close prices, not wall-clock time.
