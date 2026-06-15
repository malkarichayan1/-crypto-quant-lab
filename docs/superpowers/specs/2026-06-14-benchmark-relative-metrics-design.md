# Slice 2 Design: Benchmark-Relative Metrics

**Status:** Approved
**Date:** 2026-06-14
**Builds on:** `2026-06-14-crypto-hedge-fund-core-design.md` (Slice 1, complete)

## 1. Purpose

Slice 1 ships absolute performance metrics over a single equity curve. A strategy
that returns 80% looks great until you learn BTC returned 120% over the same window.
This slice adds **benchmark-relative metrics** so a strategy's result is judged
against a passive alternative, closing the gap noted in the Slice 1 plan self-review
(spec §3.4: "BTC-benchmark information ratio ... a thin add in Slice 2").

## 2. Scope

### In scope

- Four benchmark-relative metrics over the strategy vs. a benchmark return series:
  **beta**, **annualized alpha** (Jensen's alpha), **annualized tracking error**,
  **information ratio**. Risk-free rate is fixed at **0** (standard for crypto;
  keeps the surface small).
- A **cost-free buy-and-hold benchmark** of a configurable symbol, defaulting to
  `BTC/USDT`, derived from the same `PricePanel` over the strategy's exact dates.
- Wiring through `BacktestResult`, `summarize()`, and the CLI `run` command.

### Explicitly out of scope (other slices / specs)

- `inverse_vol` and `fixed_fraction` sizing schemes.
- Multi-year fetch pagination.
- FastAPI + persistence, React dashboard (later slices).
- Configurable risk-free rate, multi-symbol / basket benchmarks (possible future add;
  not now — YAGNI).

## 3. Component breakdown

### 3.1 DSL (`hedgefund/dsl/spec.py`)

Add one field to `StrategySpec`:

```python
benchmark: str = "BTC/USDT"
```

No new cross-reference validation rule. The benchmark need not be in `universe`
(you can trade alts and still benchmark against BTC). Whether the symbol's prices
are actually available is a data/runtime concern, surfaced gracefully (§3.4, §5).
The field is a non-empty string by Pydantic's `str` typing; an empty string is
not meaningfully invalid here and is left to the data layer to resolve to "absent".

### 3.2 Risk metrics (`hedgefund/risk/metrics.py`)

New pure functions, all assuming risk-free rate = 0. Each takes already-computed
return `Series` (consistent with the existing private `returns()` helper):

- `beta(strategy_rets, benchmark_rets) -> float`
  `cov(rs, rb) / var(rb)`. Guard: `var(rb) == 0` → `0.0`.
- `alpha(strategy_rets, benchmark_rets, periods_per_year) -> float`
  Jensen's alpha per period `mean(rs) - beta·mean(rb)`, annualized arithmetically
  (`× periods_per_year`).
- `tracking_error(strategy_rets, benchmark_rets, periods_per_year) -> float`
  `stdev(rs - rb, ddof=0) × √periods_per_year`.
- `information_ratio(strategy_rets, benchmark_rets, periods_per_year) -> float`
  `mean(rs - rb) / stdev(rs - rb, ddof=0) × √periods_per_year`. Guard: zero stdev → `0.0`.

A small private helper aligns two return series before any of the above:

- `_align(rs, rb) -> tuple[pd.Series, pd.Series]`
  Inner-join on the common index, `dropna`. If fewer than 2 overlapping points
  remain, the metric functions return `0.0`.

`summarize` gains an optional benchmark argument, staying backward compatible:

```python
def summarize(
    equity: pd.Series,
    periods_per_year: int = PERIODS_PER_YEAR,
    benchmark: pd.Series | None = None,
) -> dict[str, float]:
```

When `benchmark is None`, the returned dict is exactly today's keys. When a
benchmark equity `Series` is passed, `summarize` computes both return series and
adds: `beta`, `alpha`, `tracking_error`, `information_ratio`.

### 3.3 Engine (`hedgefund/engine/backtest.py`)

New pure helper, independent of the event loop and unit-testable in isolation:

```python
def build_benchmark_curve(
    panel, symbol: str, dates, starting_cash: float
) -> pd.Series:
```

Cost-free buy-and-hold of `symbol`, aligned to `dates` (the strategy's backtest
window):

- Before the symbol is first tradable in `dates`: flat at `starting_cash` (held cash).
- From the first tradable bar onward: `units × close`, where
  `units = starting_cash / first_tradable_close`.
- Interior gaps (NaN after first listing) are forward-filled so the curve never
  goes NaN. (BTC has no such gaps; this is defensive.)

`BacktestResult` gains:

```python
benchmark_curve: pd.Series | None = None
```

`run_backtest` builds the benchmark curve from `spec.benchmark` when that symbol is
present in `panel.close.columns`, using the same `dates` and `starting_cash` as the
strategy run; otherwise it leaves `benchmark_curve` as `None`. The benchmark is
built from the full panel's columns, before the panel is narrowed to `spec.universe`,
so a non-traded benchmark symbol still works.

### 3.4 CLI (`hedgefund/cli.py`)

`run` command:

- Load the panel for `universe ∪ {benchmark}` (deduplicated) so the benchmark's
  prices are present even when it is not in the traded universe.
- After the backtest, if `result.benchmark_curve is not None`, call
  `summarize(result.equity_curve, benchmark=result.benchmark_curve)` and print the
  four relative metrics alongside the existing absolute ones.
- If `benchmark_curve is None` (symbol not cached), print a one-line note that
  relative metrics were skipped, and still print absolute metrics.

## 4. Data flow

```
spec.benchmark
  -> CLI loads (universe ∪ {benchmark}) into PricePanel
  -> run_backtest -> strategy equity_curve
                  -> build_benchmark_curve -> aligned cost-free benchmark_curve
  -> summarize(equity, benchmark=benchmark_curve)
       -> _align(returns(strategy), returns(benchmark))
       -> beta / alpha / tracking_error / information_ratio
  -> CLI prints absolute + relative metrics
```

Both curves share the strategy's `DatetimeIndex`, so their return series align
naturally; `_align` is defensive against any residual NaN/mismatch.

## 5. Error handling

- **Benchmark symbol absent from panel** → `benchmark_curve = None`; relative metrics
  omitted (never a crash). CLI prints a skip note.
- **Misaligned / short series** → inner-join + `dropna`; < 2 overlapping points →
  metric returns `0.0`.
- **Zero-variance benchmark** (constant returns) → `beta = 0.0`.
- **Zero active-return stdev** → `information_ratio = 0.0`, `tracking_error = 0.0`.
- All guards return finite floats — never `NaN`/`inf` — matching the existing
  `sharpe`/`sortino` convention.

## 6. Testing

Known-answer and invariant tests, following Slice 1's style:

- **beta known value:** strategy returns = 2× benchmark returns → `beta ≈ 2.0`.
- **identity:** strategy curve == benchmark curve → `beta ≈ 1.0`, `alpha ≈ 0.0`,
  `tracking_error ≈ 0.0`, `information_ratio == 0.0`.
- **build_benchmark_curve:** buy-and-hold ratio equals the price ratio over the
  window; a symbol not tradable on the first bar starts flat at `starting_cash`
  then tracks price once listed.
- **backward compatibility:** `summarize(eq)` returns exactly the Slice 1 key set;
  `summarize(eq, benchmark=bm)` adds the four new keys and nothing else.
- **guards:** constant benchmark returns → finite `beta`; zero active variance →
  finite `information_ratio`.
- **e2e:** a spec carrying a `benchmark` field runs through `run_backtest` and
  yields a non-None `benchmark_curve`; `summarize` produces the relative keys.

Coverage target unchanged: `hedgefund/risk` and `hedgefund/engine` each ≥ 80%.

## 7. Tech / dependencies

No new dependencies. Uses existing `numpy` / `pandas`. Pure functions throughout;
the engine change is additive and the `summarize` change is backward compatible.

## 8. File impact summary

- Modify: `src/hedgefund/dsl/spec.py` (add `benchmark` field)
- Modify: `src/hedgefund/risk/metrics.py` (4 metrics + `_align` + `summarize` arg)
- Modify: `src/hedgefund/engine/backtest.py` (`build_benchmark_curve` + `BacktestResult` field + wiring)
- Modify: `src/hedgefund/cli.py` (`run` loads benchmark, prints relative metrics)
- Create: `tests/risk/test_relative_metrics.py`
- Modify/Create: `tests/engine/test_backtest.py` (benchmark curve + wiring tests)
