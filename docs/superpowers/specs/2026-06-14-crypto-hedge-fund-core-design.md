# Slice 1: Trustworthy Core — Design Spec

**Date:** 2026-06-14
**Project:** AI Crypto Hedge Fund Simulator
**Slice:** 1 of 4 (the deterministic, LLM-free research engine)

---

## 1. Purpose

Build a deterministic, headless backtesting core whose numbers can be trusted. It
ingests crypto market data, executes strategies expressed in a constrained DSL
through an event-driven engine that makes lookahead bias structurally impossible,
and reports risk/performance analytics. Driven entirely by a CLI and tests — no
LLM agents, no API, no frontend in this slice.

This is the foundation every later slice depends on. If a number here is wrong,
everything built on top inherits the error. Correctness is the priority over
features, speed, or breadth.

### Success criteria

- A hand-written momentum strategy spec backtests to a result we can reproduce
  and reason about line by line.
- A buy-and-hold spec produces an equity curve equal to the asset's price return
  minus fees, to the cent.
- Lookahead-bias guard tests pass: shifting input data forward in time changes
  results only in the predicted direction and magnitude.
- Engine + risk modules at 80%+ test coverage.

## 2. Scope

### In scope (Slice 1)

- Data layer: CCXT ingestion + local cache for ~20 large-cap coins, daily bars.
- Strategy DSL: Pydantic-validated spec covering momentum, mean-reversion, and
  cross-sectional rank strategies.
- Event-driven backtest engine with realistic fills, fees, and slippage.
- Risk/analytics module (pure functions over the equity curve and trade log).
- CLI to fetch data, run a spec file, and print/save results.

### Explicitly out of scope (later slices)

- LangGraph agents (Research/Quant/Critic) — Slice 3/4.
- FastAPI + persistence DB + vector store — Slice 2/4.
- React dashboard — Slice 2.
- Hourly/intraday bars, >20 coins, equities — future expansion.
- Sandboxed LLM-generated Python — non-goal by design.

## 3. Component breakdown

Each component is an independently testable unit with a narrow interface.

### 3.1 Data layer (`hedgefund/data/`)

**Responsibility:** provide clean, point-in-time-correct daily OHLCV as a tidy
structure the engine can iterate, and nothing more.

- `fetch.py` — CCXT client pulls daily OHLCV per symbol from a single exchange
  (Binance default). Paginates, rate-limits, retries.
- `cache.py` — persists each symbol to local parquet (`data/cache/<symbol>.parquet`).
  Incremental: only fetch bars newer than what's cached. Offline reads never hit
  the network.
- `universe.py` — defines the ~20-coin universe as an explicit, version-controlled
  list (no dynamic "top N by market cap" in v1 — that introduces survivorship bias
  we are not ready to handle correctly).
- `panel.py` — assembles cached symbols into a single aligned price panel: a
  DataFrame indexed by date, columns = (symbol, field). Missing bars before a
  coin's **listing date** stay `NaN` and are treated as "not tradable," not zero.

**Key invariant:** a coin with `NaN` price at bar `t` cannot be held or traded at
`t`. This is how we avoid trading assets before they existed.

**Interface:**
```
load_panel(symbols: list[str], start: date, end: date) -> PricePanel
```
`PricePanel` exposes `open/high/low/close` lookups and `is_tradable(symbol, t)`.

### 3.2 Strategy DSL (`hedgefund/dsl/`)

**Responsibility:** a validated, serializable description of a strategy — the
contract between (later) creative LLMs and the deterministic engine. Pure data,
no execution logic.

Pydantic v2 models (`spec.py`):

```
StrategySpec
  name: str
  universe: list[str] | "all"
  indicators: list[Indicator]      # named, reusable computations
  selection: Selection             # how indicators become target positions
  sizing: Sizing
  rebalance: "daily" | "weekly"
  costs: Costs
  start: date
  end: date

Indicator  (discriminated union by `type`)
  type: "momentum"   -> { id, lookback: int }
  type: "sma"        -> { id, period: int }
  type: "rsi"        -> { id, period: int }
  type: "volatility" -> { id, lookback: int }
  type: "zscore"     -> { id, source_id, lookback: int }

Selection  (discriminated union by `mode`)
  mode: "cross_sectional"
        -> { rank_by: indicator_id, long_top: int, short_bottom: int }
  mode: "time_series"
        -> { entry: Condition, exit: Condition }   # per-asset long/flat

Condition   # e.g. { indicator_id, op: "<"|">"|"<="|">=", value: float }

Sizing
  scheme: "equal_weight" | "inverse_vol" | "fixed_fraction"
  gross_leverage: float = 1.0       # cap on sum of |weights|
  vol_indicator_id: str | None      # required for inverse_vol

Costs
  fee_bps: float = 10.0             # taker fee per side
  slippage_bps: float = 5.0         # adverse slippage per side
```

**Validation rules:** every `indicator_id` referenced by `selection`/`sizing`
must exist; `long_top + short_bottom` must not exceed universe size; lookbacks
> 0; `inverse_vol` requires a `volatility` indicator. Invalid specs raise a
`SpecValidationError` with a precise message (later consumed by the Quant agent's
retry loop).

### 3.3 Event-driven engine (`hedgefund/engine/`)

**Responsibility:** turn a `StrategySpec` + `PricePanel` into an equity curve and
trade log, with no lookahead bias by construction.

**The loop (`backtest.py`):** iterate trading days `t` from `start` to `end`:

1. **Observe** — using only bars with date `≤ t`, compute every indicator and
   derive **target weights** per asset (via `selection` + `sizing`). On non-rebalance
   days, target = current target (hold).
2. **Decide** — diff target weights vs current holdings to produce orders.
3. **Execute next bar** — orders fill at the **open of `t+1`** (the next bar),
   never at `t`. This 1-bar delay is the core anti-lookahead mechanism.
4. **Apply costs** — `fee = traded_notional * fee_bps/1e4`;
   `slippage = traded_notional * slippage_bps/1e4` (adverse). Both debited from cash.
5. **Mark to market** — portfolio value at each bar uses that bar's **close**.

Modules:
- `portfolio.py` — holds cash + positions (units), computes weights, marks value.
- `orders.py` — order generation from weight deltas; fill model (next-open + costs).
- `indicators.py` — vectorized, but each indicator value at `t` provably uses only
  data `≤ t` (enforced by tests). Shared by engine; *no* indicator may peek forward.
- `backtest.py` — the orchestrating loop; returns a `BacktestResult`.

**`BacktestResult`:** equity curve (Series), trade log (DataFrame), positions
panel (weights over time), and the originating spec. Seedable/deterministic:
same spec + same data → identical result.

**Guards:** empty tradable universe at `t` → hold cash; insufficient history for
an indicator's lookback → asset excluded until enough bars exist; spec `start`
before any data → clamp with a warning.

### 3.4 Risk/analytics (`hedgefund/risk/`)

**Responsibility:** pure functions mapping a `BacktestResult` to metrics. No state,
no I/O. Daily crypto annualization factor = **365**.

`metrics.py` computes: total return, CAGR, annualized volatility, **Sharpe**,
**Sortino**, **max drawdown** (+ duration), **VaR & CVaR** (95%, historical),
turnover, win rate, and a benchmark comparison vs **BTC buy-and-hold** over the
same window (excess return, information ratio).

Each metric is an isolated function with a known-value unit test.

### 3.5 CLI (`hedgefund/cli.py`)

Thin Typer wrapper:
- `hedgefund fetch` — populate/refresh the local cache for the universe.
- `hedgefund run <spec.json>` — load spec, run backtest, print metrics table,
  optionally save the `BacktestResult` (equity curve + trade log) to disk.
- `hedgefund validate <spec.json>` — validate a spec without running it.

## 4. Data flow

```
spec.json ──► DSL.validate ──► StrategySpec
                                   │
data/cache/*.parquet ──► load_panel ──► PricePanel
                                   │            │
                                   ▼            ▼
                              engine.backtest(spec, panel)
                                   │
                                   ▼
                            BacktestResult ──► risk.metrics ──► table/JSON
```

## 5. Error handling

- **Data:** network/rate-limit errors retried with backoff; on persistent failure
  the CLI fails loudly (never silently returns partial data). Cache reads validate
  schema and date monotonicity.
- **DSL:** all validation at the boundary; `SpecValidationError` carries a precise,
  machine-readable reason (future agent retry signal).
- **Engine:** explicit guards (Section 3.3) rather than silent `NaN` propagation;
  any unexpected `NaN` in equity is a hard error, not a swallowed one.
- **Principle:** no silent failures. Every error is surfaced with context.

## 6. Testing strategy (TDD — write tests first)

This is the slice where tests carry the trust. Approach per
test-driven-development discipline.

**Known-answer fixtures** (`tests/fixtures/`): tiny hand-built price panels
(3–5 bars, 2–3 assets) where the correct equity curve is computed by hand.

Required tests:
1. **Buy-and-hold identity** — single-asset hold equals price return minus the
   modeled fees, to the cent.
2. **Lookahead guards** — shifting the input panel forward one bar shifts results
   exactly one bar; an indicator computed at `t` is unchanged when future bars are
   deleted. (If deleting future data changes a past signal, the test fails.)
3. **Fill timing** — an order decided at `t` fills at `t+1` open, verified against
   a hand-traced fixture.
4. **Cost accounting** — fees + slippage debited match `notional * bps` exactly.
5. **Risk metrics** — Sharpe/Sortino/drawdown/VaR validated against hand-computed
   values on a fixed return series.
6. **DSL validation** — each invalid-spec rule raises with the right message
   (property tests via Hypothesis for the indicator-reference checks).

**Coverage:** engine + risk ≥ 80%. Data layer gets unit tests with a mocked CCXT
client (no live network in CI).

## 7. Project layout

```
src/hedgefund/
  data/        fetch.py  cache.py  universe.py  panel.py
  dsl/         spec.py   validate.py
  engine/      indicators.py  portfolio.py  orders.py  backtest.py
  risk/        metrics.py
  cli.py
tests/
  fixtures/    hand_built_panels.py  expected_results.py
  data/  dsl/  engine/  risk/
specs/         example_momentum.json  example_buy_and_hold.json
data/cache/    (gitignored parquet cache)
pyproject.toml
```

Files kept small and single-purpose (target <300 lines each).

## 8. Tech choices

- Python 3.11+
- Pydantic v2 (DSL + validation)
- pandas + numpy (panel + indicators)
- pyarrow (parquet cache)
- ccxt (market data)
- Typer (CLI)
- pytest + pytest-cov + hypothesis (tests)
- No LLM, web, or DB dependencies in this slice.

## 9. Open decisions deferred to implementation

- Exact ~20-coin universe list (pick liquid large-caps with long history).
- Whether `inverse_vol` ships in Slice 1 or is stubbed for Slice 2 (lean: ship
  `equal_weight` + `fixed_fraction` first, add `inverse_vol` once core is green).
- Weekly-rebalance calendar convention (e.g. rebalance on Mondays).
