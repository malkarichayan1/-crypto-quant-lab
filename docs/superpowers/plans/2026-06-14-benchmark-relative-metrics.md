# Benchmark-Relative Metrics (Slice 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add benchmark-relative performance metrics (beta, annualized alpha, annualized tracking error, information ratio) computed against a cost-free buy-and-hold benchmark, defaulting to BTC/USDT and configurable per spec.

**Architecture:** A configurable `benchmark` field on `StrategySpec` names a symbol. A pure helper builds a cost-free buy-and-hold equity curve for that symbol from the existing `PricePanel`, aligned to the strategy's exact dates. `run_backtest` attaches it to `BacktestResult`. New pure functions in the risk module compute relative metrics from two return series; `summarize()` gains an optional `benchmark` argument and stays backward compatible. The CLI loads the benchmark's prices and prints the new metrics.

**Tech Stack:** Python 3.11+, Pydantic v2, pandas, numpy, Typer, pytest (existing — no new dependencies).

**Reference spec:** `docs/superpowers/specs/2026-06-14-benchmark-relative-metrics-design.md`

---

## File Structure

```
src/hedgefund/
  dsl/spec.py           # MODIFY: add `benchmark: str = "BTC/USDT"` to StrategySpec
  risk/metrics.py       # MODIFY: add _align, beta, alpha, tracking_error,
                        #         information_ratio; extend summarize()
  engine/backtest.py    # MODIFY: add build_benchmark_curve(); add benchmark_curve
                        #         field to BacktestResult; wire into run_backtest()
  cli.py                # MODIFY: run command loads benchmark + prints relative metrics
tests/
  dsl/test_benchmark_field.py     # CREATE: benchmark field default + override
  risk/test_relative_metrics.py   # CREATE: relative metric known-values + guards
  engine/test_benchmark_curve.py  # CREATE: build_benchmark_curve + run_backtest wiring
  test_cli_benchmark.py           # CREATE: CLI run prints relative metrics (CliRunner)
```

Each change is additive; nothing in Slice 1 is removed or renamed.

---

### Task 1: Add `benchmark` field to StrategySpec

**Files:**
- Modify: `src/hedgefund/dsl/spec.py:89-99` (the `StrategySpec` class)
- Create: `tests/dsl/test_benchmark_field.py`

- [ ] **Step 1: Write the failing tests**

`tests/dsl/test_benchmark_field.py`:
```python
from hedgefund.dsl.spec import StrategySpec


def _base() -> dict:
    return {
        "name": "x",
        "universe": ["BTC/USDT", "ETH/USDT"],
        "indicators": [{"type": "momentum", "id": "m90", "lookback": 90}],
        "selection": {
            "mode": "cross_sectional",
            "rank_by": "m90",
            "long_top": 1,
            "short_bottom": 0,
        },
        "sizing": {"scheme": "equal_weight"},
        "rebalance": "daily",
        "costs": {},
        "start": "2020-01-01",
        "end": "2021-01-01",
    }


def test_benchmark_defaults_to_btc():
    spec = StrategySpec.model_validate(_base())
    assert spec.benchmark == "BTC/USDT"


def test_benchmark_can_be_overridden():
    d = _base()
    d["benchmark"] = "ETH/USDT"
    spec = StrategySpec.model_validate(d)
    assert spec.benchmark == "ETH/USDT"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/dsl/test_benchmark_field.py -v`
Expected: `test_benchmark_defaults_to_btc` FAILS with `AttributeError: 'StrategySpec' object has no attribute 'benchmark'`.

- [ ] **Step 3: Add the field**

In `src/hedgefund/dsl/spec.py`, add one line to the `StrategySpec` class. Change:
```python
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
```
to:
```python
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
    benchmark: str = "BTC/USDT"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/dsl/test_benchmark_field.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/dsl/spec.py tests/dsl/test_benchmark_field.py
git commit -m "feat(dsl): add configurable benchmark field to StrategySpec"
```

---

### Task 2: Relative metric pure functions

**Files:**
- Modify: `src/hedgefund/risk/metrics.py` (append new functions after `cvar`, before `summarize`)
- Create: `tests/risk/test_relative_metrics.py`

- [ ] **Step 1: Write the failing tests**

`tests/risk/test_relative_metrics.py`:
```python
import numpy as np
import pandas as pd
import pytest

from hedgefund.risk.metrics import (
    alpha,
    beta,
    information_ratio,
    tracking_error,
)


def _rets(values) -> pd.Series:
    idx = pd.date_range("2020-01-01", periods=len(values), freq="D")
    return pd.Series(values, index=idx, dtype=float)


def test_beta_of_2x_benchmark_is_two():
    rb = _rets([0.01, -0.02, 0.03, 0.00, 0.015])
    rs = 2.0 * rb
    assert beta(rs, rb) == pytest.approx(2.0)


def test_identity_strategy_equals_benchmark():
    r = _rets([0.01, -0.02, 0.03, 0.005])
    assert beta(r, r) == pytest.approx(1.0)
    assert alpha(r, r) == pytest.approx(0.0)
    assert tracking_error(r, r) == pytest.approx(0.0)
    assert information_ratio(r, r) == 0.0


def test_beta_guards_zero_variance_benchmark():
    rb = _rets([0.01, 0.01, 0.01])  # constant -> zero variance
    rs = _rets([0.02, -0.01, 0.03])
    result = beta(rs, rb)
    assert result == 0.0
    assert np.isfinite(result)


def test_metrics_return_zero_when_too_few_overlapping_points():
    rs = _rets([0.01])
    rb = _rets([0.02])
    assert beta(rs, rb) == 0.0
    assert information_ratio(rs, rb) == 0.0


def test_alpha_is_annualized_arithmetically():
    # strategy = benchmark + constant 0.001 per period, beta == 1 -> alpha/period == 0.001
    rb = _rets([0.01, -0.02, 0.03, 0.00])
    rs = rb + 0.001
    # beta ~ 1, so per-period alpha ~ 0.001; annualized = 0.001 * 365
    assert alpha(rs, rb, periods_per_year=365) == pytest.approx(0.001 * 365, rel=1e-6)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/risk/test_relative_metrics.py -v`
Expected: FAIL with `ImportError: cannot import name 'beta' from 'hedgefund.risk.metrics'`.

- [ ] **Step 3: Add the functions**

In `src/hedgefund/risk/metrics.py`, insert the following block immediately AFTER the `cvar` function (which ends at the line `return float(-tail.mean())`) and BEFORE the `summarize` function:
```python
def _align(rs: pd.Series, rb: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Inner-join two return series on their index and drop any NaN rows."""
    joined = pd.concat([rs, rb], axis=1, join="inner").dropna()
    return joined.iloc[:, 0], joined.iloc[:, 1]


def beta(strategy_rets: pd.Series, benchmark_rets: pd.Series) -> float:
    rs, rb = _align(strategy_rets, benchmark_rets)
    if len(rs) < 2:
        return 0.0
    var_b = rb.var(ddof=0)
    if var_b == 0:
        return 0.0
    cov = ((rs - rs.mean()) * (rb - rb.mean())).mean()
    return float(cov / var_b)


def alpha(
    strategy_rets: pd.Series,
    benchmark_rets: pd.Series,
    periods_per_year: int = PERIODS_PER_YEAR,
) -> float:
    """Jensen's alpha (risk-free = 0), annualized arithmetically."""
    rs, rb = _align(strategy_rets, benchmark_rets)
    if len(rs) < 2:
        return 0.0
    per_period = rs.mean() - beta(rs, rb) * rb.mean()
    return float(per_period * periods_per_year)


def tracking_error(
    strategy_rets: pd.Series,
    benchmark_rets: pd.Series,
    periods_per_year: int = PERIODS_PER_YEAR,
) -> float:
    rs, rb = _align(strategy_rets, benchmark_rets)
    if len(rs) < 2:
        return 0.0
    active = rs - rb
    return float(active.std(ddof=0) * np.sqrt(periods_per_year))


def information_ratio(
    strategy_rets: pd.Series,
    benchmark_rets: pd.Series,
    periods_per_year: int = PERIODS_PER_YEAR,
) -> float:
    rs, rb = _align(strategy_rets, benchmark_rets)
    if len(rs) < 2:
        return 0.0
    active = rs - rb
    sd = active.std(ddof=0)
    if sd == 0:
        return 0.0
    return float((active.mean() / sd) * np.sqrt(periods_per_year))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/risk/test_relative_metrics.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/risk/metrics.py tests/risk/test_relative_metrics.py
git commit -m "feat(risk): add beta, alpha, tracking error, information ratio"
```

---

### Task 3: Extend `summarize()` with optional benchmark

**Files:**
- Modify: `src/hedgefund/risk/metrics.py:72-83` (the `summarize` function)
- Modify: `tests/risk/test_relative_metrics.py` (append two tests)

- [ ] **Step 1: Write the failing tests**

Append to `tests/risk/test_relative_metrics.py`:
```python
def _equity(values) -> pd.Series:
    idx = pd.date_range("2020-01-01", periods=len(values), freq="D")
    return pd.Series(values, index=idx, dtype=float)


def test_summarize_without_benchmark_is_unchanged():
    from hedgefund.risk.metrics import summarize

    eq = _equity([100, 110, 121, 133.1])
    out = summarize(eq)
    assert set(out) == {
        "total_return",
        "cagr",
        "ann_vol",
        "sharpe",
        "sortino",
        "max_drawdown",
        "var_95",
        "cvar_95",
    }


def test_summarize_with_benchmark_adds_relative_keys():
    from hedgefund.risk.metrics import summarize

    eq = _equity([100, 110, 121, 133.1])
    bm = _equity([100, 105, 110, 120])
    base = summarize(eq)
    out = summarize(eq, benchmark=bm)
    assert set(out) - set(base) == {
        "beta",
        "alpha",
        "tracking_error",
        "information_ratio",
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/risk/test_relative_metrics.py::test_summarize_with_benchmark_adds_relative_keys -v`
Expected: FAIL with `TypeError: summarize() got an unexpected keyword argument 'benchmark'`.

- [ ] **Step 3: Extend summarize**

In `src/hedgefund/risk/metrics.py`, replace the entire `summarize` function:
```python
def summarize(equity: pd.Series, periods_per_year: int = PERIODS_PER_YEAR) -> dict[str, float]:
    r = returns(equity)
    return {
        "total_return": total_return(equity),
        "cagr": cagr(equity, periods_per_year),
        "ann_vol": ann_vol(equity, periods_per_year),
        "sharpe": sharpe(equity, periods_per_year),
        "sortino": sortino(equity, periods_per_year),
        "max_drawdown": max_drawdown(equity),
        "var_95": value_at_risk(r, 0.95),
        "cvar_95": cvar(r, 0.95),
    }
```
with:
```python
def summarize(
    equity: pd.Series,
    periods_per_year: int = PERIODS_PER_YEAR,
    benchmark: pd.Series | None = None,
) -> dict[str, float]:
    r = returns(equity)
    out = {
        "total_return": total_return(equity),
        "cagr": cagr(equity, periods_per_year),
        "ann_vol": ann_vol(equity, periods_per_year),
        "sharpe": sharpe(equity, periods_per_year),
        "sortino": sortino(equity, periods_per_year),
        "max_drawdown": max_drawdown(equity),
        "var_95": value_at_risk(r, 0.95),
        "cvar_95": cvar(r, 0.95),
    }
    if benchmark is not None:
        rb = returns(benchmark)
        out["beta"] = beta(r, rb)
        out["alpha"] = alpha(r, rb, periods_per_year)
        out["tracking_error"] = tracking_error(r, rb, periods_per_year)
        out["information_ratio"] = information_ratio(r, rb, periods_per_year)
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/risk/test_relative_metrics.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/risk/metrics.py tests/risk/test_relative_metrics.py
git commit -m "feat(risk): summarize accepts optional benchmark for relative metrics"
```

---

### Task 4: Benchmark curve helper + wire into backtest

**Files:**
- Modify: `src/hedgefund/engine/backtest.py` (add `build_benchmark_curve`, add field to `BacktestResult`, wire into `run_backtest`)
- Create: `tests/engine/test_benchmark_curve.py`

- [ ] **Step 1: Write the failing tests**

`tests/engine/test_benchmark_curve.py`:
```python
from datetime import date

import pytest

from hedgefund.dsl.spec import (
    Costs,
    CrossSectionalSelection,
    MomentumIndicator,
    Sizing,
    StrategySpec,
)
from hedgefund.engine.backtest import build_benchmark_curve, run_backtest
from tests.fixtures.panels import single_asset_panel, two_asset_panel


def test_benchmark_curve_tracks_buy_and_hold_price():
    panel = single_asset_panel([100.0, 110.0, 121.0, 133.1])
    dates = list(panel.dates)
    curve = build_benchmark_curve(panel, "AAA", dates, starting_cash=1000.0)
    assert curve.iloc[0] == pytest.approx(1000.0)
    assert curve.iloc[-1] / curve.iloc[0] == pytest.approx(133.1 / 100.0)
    assert list(curve.index) == dates


def test_benchmark_curve_flat_cash_until_symbol_listed():
    panel = two_asset_panel()  # AAA close is NaN on bar 0 (pre-listing)
    dates = list(panel.dates)
    curve = build_benchmark_curve(panel, "AAA", dates, starting_cash=1000.0)
    assert curve.iloc[0] == pytest.approx(1000.0)  # held cash before listing
    # listed at bar 1 (close 100) -> still 1000; bar 2 (close 110) -> 1100
    assert curve.iloc[2] / curve.iloc[1] == pytest.approx(110.0 / 100.0)


def _spec(universe, benchmark, end) -> StrategySpec:
    return StrategySpec(
        name="b",
        universe=universe,
        indicators=[MomentumIndicator(type="momentum", id="m1", lookback=1)],
        selection=CrossSectionalSelection(
            mode="cross_sectional", rank_by="m1", long_top=1, short_bottom=0
        ),
        sizing=Sizing(scheme="equal_weight", gross_leverage=1.0),
        rebalance="daily",
        costs=Costs(fee_bps=0, slippage_bps=0),
        start=date(2020, 1, 1),
        end=end,
        benchmark=benchmark,
    )


def test_run_backtest_attaches_aligned_benchmark_curve():
    panel = two_asset_panel()  # columns AAA, BBB
    spec = _spec(universe=["BBB"], benchmark="AAA", end=date(2020, 1, 3))
    result = run_backtest(spec, panel, starting_cash=1000.0)
    assert result.benchmark_curve is not None
    assert list(result.benchmark_curve.index) == list(result.equity_curve.index)


def test_run_backtest_benchmark_curve_none_when_symbol_absent():
    panel = single_asset_panel([100.0, 110.0, 121.0])  # only column AAA
    spec = _spec(universe=["AAA"], benchmark="ZZZ", end=date(2020, 1, 3))
    result = run_backtest(spec, panel, starting_cash=1000.0)
    assert result.benchmark_curve is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/engine/test_benchmark_curve.py -v`
Expected: FAIL with `ImportError: cannot import name 'build_benchmark_curve' from 'hedgefund.engine.backtest'`.

- [ ] **Step 3a: Add the `benchmark_curve` field to `BacktestResult`**

In `src/hedgefund/engine/backtest.py`, change:
```python
@dataclass
class BacktestResult:
    equity_curve: pd.Series
    trade_log: pd.DataFrame
    spec: StrategySpec
```
to:
```python
@dataclass
class BacktestResult:
    equity_curve: pd.Series
    trade_log: pd.DataFrame
    spec: StrategySpec
    benchmark_curve: pd.Series | None = None
```

- [ ] **Step 3b: Add the `build_benchmark_curve` helper**

In `src/hedgefund/engine/backtest.py`, add this function immediately AFTER `_is_rebalance_day` and BEFORE `run_backtest`:
```python
def build_benchmark_curve(panel, symbol: str, dates, starting_cash: float) -> pd.Series:
    """Cost-free buy-and-hold equity curve for `symbol`, aligned to `dates`.

    Flat at `starting_cash` until the symbol is first tradable, then `units * close`
    where `units = starting_cash / first_tradable_close`. Interior NaN gaps after
    listing are forward-filled so the curve never goes NaN.
    """
    idx = pd.DatetimeIndex(dates)
    close = panel.close[symbol].reindex(idx)
    valid = close.dropna()
    if valid.empty:
        return pd.Series(float(starting_cash), index=idx, name="benchmark")
    first_t = valid.index[0]
    units = starting_cash / float(valid.iloc[0])
    held = close.ffill() * units
    curve = held.where(idx >= first_t, other=float(starting_cash))
    return pd.Series(curve.to_numpy(dtype=float), index=idx, name="benchmark")
```

- [ ] **Step 3c: Wire it into `run_backtest`**

In `src/hedgefund/engine/backtest.py`, change the final return block of `run_backtest`:
```python
    return BacktestResult(
        equity_curve=pd.Series(equity, index=pd.DatetimeIndex(dates), name="equity"),
        trade_log=pd.DataFrame(trades),
        spec=spec,
    )
```
to:
```python
    benchmark_curve = None
    if spec.benchmark in panel.close.columns:
        benchmark_curve = build_benchmark_curve(panel, spec.benchmark, dates, starting_cash)

    return BacktestResult(
        equity_curve=pd.Series(equity, index=pd.DatetimeIndex(dates), name="equity"),
        trade_log=pd.DataFrame(trades),
        spec=spec,
        benchmark_curve=benchmark_curve,
    )
```

> Note: the benchmark is read from `panel.close` (the full panel), not the
> universe-narrowed `close`, so a benchmark symbol that is not in `spec.universe`
> still works. `dates` is the same masked index used for the strategy's equity,
> so the two curves align by construction.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/engine/test_benchmark_curve.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/engine/backtest.py tests/engine/test_benchmark_curve.py
git commit -m "feat(engine): build cost-free benchmark curve and attach to result"
```

---

### Task 5: CLI prints relative metrics

**Files:**
- Modify: `src/hedgefund/cli.py:31-42` (the `run` command)
- Create: `tests/test_cli_benchmark.py`

- [ ] **Step 1: Write the failing test**

`tests/test_cli_benchmark.py`:
```python
import json

from typer.testing import CliRunner

from hedgefund.cli import app
from hedgefund.data.cache import write_symbol
from hedgefund.data.fetch import ohlcv_to_frame


def _frame(closes):
    base_ms = 1577836800000  # 2020-01-01 UTC
    day_ms = 86_400_000
    rows = [[base_ms + i * day_ms, c, c, c, c, 1.0] for i, c in enumerate(closes)]
    return ohlcv_to_frame(rows)


def test_cli_run_prints_relative_metrics(tmp_path):
    write_symbol("AAA/USDT", _frame([100, 110, 121, 133.1, 146.41]), cache_dir=tmp_path)
    write_symbol("BTC/USDT", _frame([100, 105, 110, 115, 120]), cache_dir=tmp_path)
    spec = {
        "name": "cli_bench",
        "universe": ["AAA/USDT"],
        "indicators": [{"type": "momentum", "id": "m1", "lookback": 1}],
        "selection": {
            "mode": "cross_sectional",
            "rank_by": "m1",
            "long_top": 1,
            "short_bottom": 0,
        },
        "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
        "rebalance": "daily",
        "costs": {"fee_bps": 10, "slippage_bps": 5},
        "start": "2020-01-01",
        "end": "2020-01-05",
        "benchmark": "BTC/USDT",
    }
    spec_path = tmp_path / "spec.json"
    spec_path.write_text(json.dumps(spec))

    result = CliRunner().invoke(
        app, ["run", str(spec_path), "--cache-dir", str(tmp_path)]
    )
    assert result.exit_code == 0, result.stdout
    assert "information_ratio" in result.stdout
    assert "beta" in result.stdout
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_cli_benchmark.py -v`
Expected: FAIL — `information_ratio` is not in the output because the `run` command does not yet load the benchmark or pass it to `summarize`.

- [ ] **Step 3: Update the `run` command**

In `src/hedgefund/cli.py`, replace the entire `run` command:
```python
@app.command()
def run(spec_path: Path, cache_dir: Path = DEFAULT_CACHE_DIR, starting_cash: float = 10_000.0) -> None:
    """Run a backtest from a spec file against the local cache."""
    spec = _load_spec(spec_path)
    if not isinstance(spec.universe, list):
        typer.echo("universe='all' not supported yet; pass an explicit list", err=True)
        raise typer.Exit(code=1)
    panel = load_panel(spec.universe, spec.start, spec.end, cache_dir=cache_dir)
    result = run_backtest(spec, panel, starting_cash=starting_cash)
    metrics = summarize(result.equity_curve)
    for k, v in metrics.items():
        typer.echo(f"{k:>14}: {v: .4f}")
```
with:
```python
@app.command()
def run(spec_path: Path, cache_dir: Path = DEFAULT_CACHE_DIR, starting_cash: float = 10_000.0) -> None:
    """Run a backtest from a spec file against the local cache."""
    spec = _load_spec(spec_path)
    if not isinstance(spec.universe, list):
        typer.echo("universe='all' not supported yet; pass an explicit list", err=True)
        raise typer.Exit(code=1)
    symbols = list(dict.fromkeys([*spec.universe, spec.benchmark]))
    panel = load_panel(symbols, spec.start, spec.end, cache_dir=cache_dir)
    result = run_backtest(spec, panel, starting_cash=starting_cash)
    if result.benchmark_curve is not None:
        metrics = summarize(result.equity_curve, benchmark=result.benchmark_curve)
    else:
        typer.echo(
            f"note: benchmark '{spec.benchmark}' not in cache; relative metrics skipped",
            err=True,
        )
        metrics = summarize(result.equity_curve)
    for k, v in metrics.items():
        typer.echo(f"{k:>18}: {v: .4f}")
```

> `dict.fromkeys` deduplicates while preserving order, so a benchmark already in
> the universe is not loaded twice. The column width widens to 18 to fit the
> longest key, `information_ratio`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_cli_benchmark.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/cli.py tests/test_cli_benchmark.py
git commit -m "feat(cli): load benchmark and print relative metrics in run"
```

---

### Task 6: Full suite + coverage gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite with coverage**

Run:
```bash
python -m pytest --cov=hedgefund --cov-report=term-missing
```
Expected: all tests PASS; `hedgefund/risk` and `hedgefund/engine` each ≥ 80% coverage.

- [ ] **Step 2: If any module dropped below 80%, add targeted tests**

If `hedgefund/engine/backtest.py` or `hedgefund/risk/metrics.py` is below 80%,
inspect the `term-missing` output and add a focused test for the uncovered line
(e.g. the empty-`valid` branch in `build_benchmark_curve` — feed a panel whose
benchmark column is entirely NaN and assert the curve is flat at `starting_cash`).
Do NOT weaken or delete assertions to raise the number.

Example test for the all-NaN benchmark branch (add to `tests/engine/test_benchmark_curve.py` only if needed for coverage):
```python
import numpy as np
import pandas as pd

from hedgefund.data.panel import FIELDS, PricePanel


def test_benchmark_curve_all_nan_symbol_is_flat_cash():
    idx = pd.date_range("2020-01-01", periods=3, freq="D")
    nan_col = pd.DataFrame({"AAA": [np.nan, np.nan, np.nan]}, index=idx)
    panel = PricePanel.from_field_frames({f: nan_col for f in FIELDS})
    curve = build_benchmark_curve(panel, "AAA", list(idx), starting_cash=1000.0)
    assert (curve == 1000.0).all()
```

- [ ] **Step 3: Commit any added coverage tests**

```bash
git add tests/
git commit -m "test: cover benchmark curve edge cases to meet coverage gate"
```

(If no tests were needed, skip this commit.)

---

## Self-Review (completed)

**Spec coverage check** — every spec section maps to a task:
- §3.1 DSL `benchmark` field → Task 1.
- §3.2 risk metrics (`_align`, `beta`, `alpha`, `tracking_error`, `information_ratio`) → Task 2; `summarize` optional benchmark → Task 3.
- §3.3 engine (`build_benchmark_curve`, `BacktestResult.benchmark_curve`, `run_backtest` wiring) → Task 4.
- §3.4 CLI (`universe ∪ {benchmark}` load, print relative metrics, skip note) → Task 5.
- §5 error handling → covered by tests: benchmark absent (Task 4 `..._none_when_symbol_absent`, Task 5 skip path), < 2 points (Task 2), zero-variance/zero-stdev guards (Task 2), all-NaN benchmark (Task 6).
- §6 testing → Tasks 1–6; coverage gate in Task 6.

**Placeholder scan:** none — every code step contains complete, runnable code.

**Type consistency:** `build_benchmark_curve(panel, symbol, dates, starting_cash)`,
`beta/alpha/tracking_error/information_ratio(strategy_rets, benchmark_rets[, periods_per_year])`,
`summarize(equity, periods_per_year, benchmark)`, and `BacktestResult.benchmark_curve`
are each defined once and referenced with matching signatures across tasks. New
`summarize` keys (`beta`, `alpha`, `tracking_error`, `information_ratio`) match the
keys asserted in Task 3's test and printed by Task 5's CLI.

**Backward compatibility:** `summarize` and `run_backtest`/`BacktestResult` only gain
optional/defaulted parameters; Slice 1 callers and tests are unaffected (verified by
Task 3's `test_summarize_without_benchmark_is_unchanged` and the full suite in Task 6).
