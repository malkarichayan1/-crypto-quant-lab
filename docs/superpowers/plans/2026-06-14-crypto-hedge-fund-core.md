# Crypto Hedge Fund Core (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, headless crypto backtesting core — data layer, strategy DSL, event-driven engine, and risk analytics — whose numbers are trustworthy by construction.

**Architecture:** A constrained Pydantic DSL describes strategies. A custom event-driven engine iterates daily bars, deciding at bar `t`'s close and filling at bar `t+1`'s open with fees + slippage, which makes lookahead bias structurally impossible. Pure-function risk metrics summarize the resulting equity curve. A CCXT-backed local parquet cache feeds it, and a Typer CLI drives it.

**Tech Stack:** Python 3.11+, Pydantic v2, pandas, numpy, pyarrow, ccxt, Typer, pytest + pytest-cov + hypothesis.

**Reference spec:** `docs/superpowers/specs/2026-06-14-crypto-hedge-fund-core-design.md`

---

## File Structure

```
src/hedgefund/
  __init__.py
  dsl/
    __init__.py
    spec.py          # Pydantic models: StrategySpec, Indicator union, Selection union, Sizing, Costs
    validate.py      # cross-reference validation -> SpecValidationError
  data/
    __init__.py
    universe.py      # explicit coin list
    panel.py         # PricePanel (in-memory OHLCV), load_panel from cache
    fetch.py         # ccxt OHLCV fetch
    cache.py         # parquet read/write, incremental
  engine/
    __init__.py
    indicators.py    # momentum/sma/rsi/volatility/zscore, each provably uses only data <= t
    portfolio.py     # cash + units, mark-to-market, weights
    orders.py        # weight-delta -> fills at next open with costs
    weights.py       # selection + sizing -> target weights at a decision bar
    backtest.py      # the event loop -> BacktestResult
  risk/
    __init__.py
    metrics.py       # pure metric functions + summarize()
  cli.py             # Typer: fetch / validate / run
tests/
  fixtures/
    __init__.py
    panels.py        # tiny hand-built PricePanels with known answers
  dsl/  data/  engine/  risk/
specs/
  example_buy_and_hold.json
  example_momentum.json
pyproject.toml
.gitignore           # (already exists)
```

Each file has one responsibility and stays under ~300 lines.

---

### Task 1: Project scaffold

**Files:**
- Create: `pyproject.toml`
- Create: `src/hedgefund/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/test_smoke.py`

- [ ] **Step 1: Write the failing test**

`tests/test_smoke.py`:
```python
def test_package_imports():
    import hedgefund

    assert hedgefund.__version__ == "0.1.0"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_smoke.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'hedgefund'`

- [ ] **Step 3: Create the package and config**

`pyproject.toml`:
```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "hedgefund"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "pydantic>=2.6",
    "pandas>=2.1",
    "numpy>=1.26",
    "pyarrow>=15",
    "ccxt>=4.2",
    "typer>=0.12",
]

[project.optional-dependencies]
dev = ["pytest>=8", "pytest-cov>=5", "hypothesis>=6"]

[project.scripts]
hedgefund = "hedgefund.cli:app"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
pythonpath = ["src"]
addopts = "-q"
```

`src/hedgefund/__init__.py`:
```python
__version__ = "0.1.0"
```

`tests/__init__.py`: empty file.

- [ ] **Step 4: Install dev deps and run the test**

Run:
```bash
python -m pip install -e ".[dev]"
python -m pytest tests/test_smoke.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml src/hedgefund/__init__.py tests/__init__.py tests/test_smoke.py
git commit -m "chore: scaffold hedgefund package"
```

---

### Task 2: DSL models

**Files:**
- Create: `src/hedgefund/dsl/__init__.py`
- Create: `src/hedgefund/dsl/spec.py`
- Create: `tests/dsl/__init__.py`
- Create: `tests/dsl/test_spec.py`

- [ ] **Step 1: Write the failing test**

`tests/dsl/test_spec.py`:
```python
from datetime import date

from hedgefund.dsl.spec import StrategySpec


def test_parses_minimal_momentum_spec():
    spec = StrategySpec.model_validate(
        {
            "name": "mom",
            "universe": ["BTC/USDT", "ETH/USDT"],
            "indicators": [{"type": "momentum", "id": "m90", "lookback": 90}],
            "selection": {
                "mode": "cross_sectional",
                "rank_by": "m90",
                "long_top": 1,
                "short_bottom": 0,
            },
            "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
            "rebalance": "weekly",
            "costs": {"fee_bps": 10, "slippage_bps": 5},
            "start": "2020-01-01",
            "end": "2021-01-01",
        }
    )
    assert spec.name == "mom"
    assert spec.indicators[0].lookback == 90
    assert spec.selection.long_top == 1
    assert spec.start == date(2020, 1, 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/dsl/test_spec.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'hedgefund.dsl'`

- [ ] **Step 3: Write the models**

`src/hedgefund/dsl/__init__.py`: empty file.

`src/hedgefund/dsl/spec.py`:
```python
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class MomentumIndicator(BaseModel):
    type: Literal["momentum"]
    id: str
    lookback: int = Field(gt=0)


class SmaIndicator(BaseModel):
    type: Literal["sma"]
    id: str
    period: int = Field(gt=0)


class RsiIndicator(BaseModel):
    type: Literal["rsi"]
    id: str
    period: int = Field(gt=0)


class VolatilityIndicator(BaseModel):
    type: Literal["volatility"]
    id: str
    lookback: int = Field(gt=0)


class ZscoreIndicator(BaseModel):
    type: Literal["zscore"]
    id: str
    source_id: str
    lookback: int = Field(gt=0)


Indicator = Annotated[
    Union[
        MomentumIndicator,
        SmaIndicator,
        RsiIndicator,
        VolatilityIndicator,
        ZscoreIndicator,
    ],
    Field(discriminator="type"),
]


class Condition(BaseModel):
    indicator_id: str
    op: Literal["<", ">", "<=", ">="]
    value: float


class CrossSectionalSelection(BaseModel):
    mode: Literal["cross_sectional"]
    rank_by: str
    long_top: int = Field(ge=0)
    short_bottom: int = Field(ge=0)


class TimeSeriesSelection(BaseModel):
    mode: Literal["time_series"]
    entry: Condition
    exit: Condition


Selection = Annotated[
    Union[CrossSectionalSelection, TimeSeriesSelection],
    Field(discriminator="mode"),
]


class Sizing(BaseModel):
    scheme: Literal["equal_weight", "inverse_vol", "fixed_fraction"]
    gross_leverage: float = Field(default=1.0, gt=0)
    fraction: float = Field(default=0.1, gt=0)  # used by fixed_fraction
    vol_indicator_id: str | None = None  # required by inverse_vol


class Costs(BaseModel):
    fee_bps: float = Field(default=10.0, ge=0)
    slippage_bps: float = Field(default=5.0, ge=0)


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

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/dsl/test_spec.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/dsl tests/dsl
git commit -m "feat(dsl): add StrategySpec pydantic models"
```

---

### Task 3: DSL cross-reference validation

**Files:**
- Create: `src/hedgefund/dsl/validate.py`
- Create: `tests/dsl/test_validate.py`

- [ ] **Step 1: Write the failing tests**

`tests/dsl/test_validate.py`:
```python
import pytest

from hedgefund.dsl.spec import StrategySpec
from hedgefund.dsl.validate import SpecValidationError, validate_spec


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


def test_valid_spec_passes():
    validate_spec(StrategySpec.model_validate(_base()))  # no raise


def test_unknown_rank_by_indicator_raises():
    d = _base()
    d["selection"]["rank_by"] = "does_not_exist"
    with pytest.raises(SpecValidationError, match="rank_by"):
        validate_spec(StrategySpec.model_validate(d))


def test_selection_exceeds_universe_raises():
    d = _base()
    d["selection"]["long_top"] = 5
    with pytest.raises(SpecValidationError, match="exceeds universe"):
        validate_spec(StrategySpec.model_validate(d))


def test_inverse_vol_requires_vol_indicator():
    d = _base()
    d["sizing"] = {"scheme": "inverse_vol", "vol_indicator_id": "missing"}
    with pytest.raises(SpecValidationError, match="inverse_vol"):
        validate_spec(StrategySpec.model_validate(d))


def test_end_before_start_raises():
    d = _base()
    d["end"] = "2019-01-01"
    with pytest.raises(SpecValidationError, match="end"):
        validate_spec(StrategySpec.model_validate(d))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/dsl/test_validate.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'hedgefund.dsl.validate'`

- [ ] **Step 3: Write the validator**

`src/hedgefund/dsl/validate.py`:
```python
from __future__ import annotations

from hedgefund.dsl.spec import (
    CrossSectionalSelection,
    StrategySpec,
    TimeSeriesSelection,
)


class SpecValidationError(ValueError):
    """Raised when a StrategySpec is internally inconsistent."""


def validate_spec(spec: StrategySpec) -> None:
    ids = {ind.id for ind in spec.indicators}
    if len(ids) != len(spec.indicators):
        raise SpecValidationError("duplicate indicator id")

    if spec.end <= spec.start:
        raise SpecValidationError("end must be after start")

    sel = spec.selection
    if isinstance(sel, CrossSectionalSelection):
        if sel.rank_by not in ids:
            raise SpecValidationError(f"rank_by '{sel.rank_by}' is not a defined indicator")
        if isinstance(spec.universe, list):
            if sel.long_top + sel.short_bottom > len(spec.universe):
                raise SpecValidationError("long_top + short_bottom exceeds universe size")
    elif isinstance(sel, TimeSeriesSelection):
        for cond in (sel.entry, sel.exit):
            if cond.indicator_id not in ids:
                raise SpecValidationError(
                    f"condition references unknown indicator '{cond.indicator_id}'"
                )

    if spec.sizing.scheme == "inverse_vol":
        vid = spec.sizing.vol_indicator_id
        vol_ids = {ind.id for ind in spec.indicators if ind.type == "volatility"}
        if vid not in vol_ids:
            raise SpecValidationError(
                "inverse_vol sizing requires vol_indicator_id pointing to a volatility indicator"
            )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/dsl/test_validate.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/dsl/validate.py tests/dsl/test_validate.py
git commit -m "feat(dsl): add cross-reference spec validation"
```

---

### Task 4: PricePanel + test fixtures

**Files:**
- Create: `src/hedgefund/data/__init__.py`
- Create: `src/hedgefund/data/panel.py`
- Create: `tests/fixtures/__init__.py`
- Create: `tests/fixtures/panels.py`
- Create: `tests/data/__init__.py`
- Create: `tests/data/test_panel.py`

- [ ] **Step 1: Write the failing test**

`tests/data/test_panel.py`:
```python
import numpy as np

from tests.fixtures.panels import two_asset_panel


def test_panel_exposes_ohlc_and_tradability():
    panel = two_asset_panel()
    dates = panel.dates
    assert list(panel.symbols) == ["AAA", "BBB"]
    # AAA has a NaN close on the first bar -> not tradable there
    assert panel.is_tradable("AAA", dates[0]) is False
    assert panel.is_tradable("AAA", dates[1]) is True
    assert panel.close_at("BBB", dates[0]) == 100.0
    assert np.isnan(panel.close.loc[dates[0], "AAA"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/data/test_panel.py -v`
Expected: FAIL (`ModuleNotFoundError` for `hedgefund.data.panel` / `tests.fixtures.panels`)

- [ ] **Step 3: Write PricePanel and the fixture**

`src/hedgefund/data/__init__.py`: empty file.

`src/hedgefund/data/panel.py`:
```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

FIELDS = ("open", "high", "low", "close", "volume")


@dataclass(frozen=True)
class PricePanel:
    """OHLCV for a set of symbols over a date index.

    Each field is a DataFrame indexed by date with one column per symbol.
    A NaN close marks a bar where the symbol is not tradable (e.g. pre-listing).
    """

    open: pd.DataFrame
    high: pd.DataFrame
    low: pd.DataFrame
    close: pd.DataFrame
    volume: pd.DataFrame

    @property
    def dates(self) -> pd.DatetimeIndex:
        return self.close.index

    @property
    def symbols(self) -> pd.Index:
        return self.close.columns

    def is_tradable(self, symbol: str, t: date) -> bool:
        return bool(np.isfinite(self.close.loc[t, symbol]))

    def close_at(self, symbol: str, t: date) -> float:
        return float(self.close.loc[t, symbol])

    def open_at(self, symbol: str, t: date) -> float:
        return float(self.open.loc[t, symbol])

    @classmethod
    def from_field_frames(cls, frames: dict[str, pd.DataFrame]) -> "PricePanel":
        return cls(**{f: frames[f] for f in FIELDS})
```

`tests/fixtures/__init__.py`: empty file.

`tests/fixtures/panels.py`:
```python
from __future__ import annotations

import numpy as np
import pandas as pd

from hedgefund.data.panel import FIELDS, PricePanel


def _frame(values: dict[str, list[float]], index: pd.DatetimeIndex) -> pd.DataFrame:
    return pd.DataFrame(values, index=index)


def two_asset_panel() -> PricePanel:
    """3 bars, 2 assets. AAA is not listed on bar 0 (NaN)."""
    idx = pd.to_datetime(["2020-01-01", "2020-01-02", "2020-01-03"])
    close = _frame({"AAA": [np.nan, 100.0, 110.0], "BBB": [100.0, 100.0, 100.0]}, idx)
    open_ = _frame({"AAA": [np.nan, 100.0, 100.0], "BBB": [100.0, 100.0, 100.0]}, idx)
    frames = {
        "open": open_,
        "high": close,
        "low": open_,
        "close": close,
        "volume": _frame({"AAA": [0.0, 1.0, 1.0], "BBB": [1.0, 1.0, 1.0]}, idx),
    }
    return PricePanel.from_field_frames({f: frames[f] for f in FIELDS})


def single_asset_panel(closes: list[float]) -> PricePanel:
    """One asset 'AAA'; open[t] == close[t-1] (fills at next open use this)."""
    idx = pd.date_range("2020-01-01", periods=len(closes), freq="D")
    close = _frame({"AAA": closes}, idx)
    opens = [closes[0]] + closes[:-1]
    open_ = _frame({"AAA": opens}, idx)
    frames = {
        "open": open_,
        "high": close,
        "low": close,
        "close": close,
        "volume": _frame({"AAA": [1.0] * len(closes)}, idx),
    }
    return PricePanel.from_field_frames({f: frames[f] for f in FIELDS})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/data/test_panel.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/data/__init__.py src/hedgefund/data/panel.py tests/fixtures tests/data
git commit -m "feat(data): add PricePanel and test fixtures"
```

---

### Task 5: Indicators (with lookahead guards)

**Files:**
- Create: `src/hedgefund/engine/__init__.py`
- Create: `src/hedgefund/engine/indicators.py`
- Create: `tests/engine/__init__.py`
- Create: `tests/engine/test_indicators.py`

- [ ] **Step 1: Write the failing tests**

`tests/engine/test_indicators.py`:
```python
import numpy as np
import pandas as pd
import pytest

from hedgefund.engine.indicators import compute_indicator
from hedgefund.dsl.spec import MomentumIndicator, SmaIndicator


def _closes() -> pd.DataFrame:
    idx = pd.date_range("2020-01-01", periods=5, freq="D")
    return pd.DataFrame({"AAA": [100.0, 110.0, 121.0, 133.1, 146.41]}, index=idx)


def test_momentum_is_trailing_return():
    close = _closes()
    out = compute_indicator(MomentumIndicator(type="momentum", id="m1", lookback=1), close)
    # bar 1: 110/100 - 1 = 0.10
    assert out["AAA"].iloc[1] == pytest.approx(0.10)
    # bar 0 has no prior -> NaN
    assert np.isnan(out["AAA"].iloc[0])


def test_sma_uses_only_trailing_window():
    close = _closes()
    out = compute_indicator(SmaIndicator(type="sma", id="s2", period=2), close)
    # bar 1 = mean(100,110)=105
    assert out["AAA"].iloc[1] == pytest.approx(105.0)
    assert np.isnan(out["AAA"].iloc[0])


def test_no_lookahead_deleting_future_does_not_change_past():
    close = _closes()
    full = compute_indicator(SmaIndicator(type="sma", id="s2", period=2), close)
    truncated = compute_indicator(
        SmaIndicator(type="sma", id="s2", period=2), close.iloc[:3]
    )
    # value at bar 1 must be identical whether or not bars 3,4 exist
    assert full["AAA"].iloc[1] == truncated["AAA"].iloc[1]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/engine/test_indicators.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'hedgefund.engine.indicators'`)

- [ ] **Step 3: Write the indicators**

`src/hedgefund/engine/__init__.py`: empty file.

`src/hedgefund/engine/indicators.py`:
```python
from __future__ import annotations

import pandas as pd

from hedgefund.dsl.spec import (
    Indicator,
    MomentumIndicator,
    RsiIndicator,
    SmaIndicator,
    VolatilityIndicator,
    ZscoreIndicator,
)


def compute_indicator(
    indicator: Indicator,
    close: pd.DataFrame,
    computed: dict[str, pd.DataFrame] | None = None,
) -> pd.DataFrame:
    """Return a (dates x symbols) frame where row t uses only data with index <= t.

    `computed` holds previously-computed indicator frames, keyed by id, so that
    zscore can reference a source indicator.
    """
    if isinstance(indicator, MomentumIndicator):
        return close.pct_change(indicator.lookback)
    if isinstance(indicator, SmaIndicator):
        return close.rolling(indicator.period).mean()
    if isinstance(indicator, VolatilityIndicator):
        return close.pct_change().rolling(indicator.lookback).std()
    if isinstance(indicator, RsiIndicator):
        return _rsi(close, indicator.period)
    if isinstance(indicator, ZscoreIndicator):
        if computed is None or indicator.source_id not in computed:
            raise KeyError(f"zscore source '{indicator.source_id}' not computed yet")
        src = computed[indicator.source_id]
        mean = src.rolling(indicator.lookback).mean()
        std = src.rolling(indicator.lookback).std()
        return (src - mean) / std
    raise TypeError(f"unknown indicator type: {indicator!r}")


def _rsi(close: pd.DataFrame, period: int) -> pd.DataFrame:
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def compute_all(indicators: list[Indicator], close: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Compute every indicator, honoring zscore dependencies (source before dependent)."""
    out: dict[str, pd.DataFrame] = {}
    for ind in [i for i in indicators if not isinstance(i, ZscoreIndicator)]:
        out[ind.id] = compute_indicator(ind, close, out)
    for ind in [i for i in indicators if isinstance(i, ZscoreIndicator)]:
        out[ind.id] = compute_indicator(ind, close, out)
    return out
```

> Note: every implemented indicator uses only `pct_change`, `rolling`, or `diff`,
> all strictly trailing — so no indicator can see the future. The
> `test_no_lookahead_*` test enforces this for any future change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/engine/test_indicators.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/engine/__init__.py src/hedgefund/engine/indicators.py tests/engine
git commit -m "feat(engine): add trailing indicators with lookahead guard test"
```

---

### Task 6: Target-weight computation (selection + sizing)

**Files:**
- Create: `src/hedgefund/engine/weights.py`
- Create: `tests/engine/test_weights.py`

- [ ] **Step 1: Write the failing tests**

`tests/engine/test_weights.py`:
```python
import pandas as pd

from hedgefund.dsl.spec import (
    CrossSectionalSelection,
    Sizing,
    TimeSeriesSelection,
    Condition,
)
from hedgefund.engine.weights import target_weights


def test_cross_sectional_long_top_equal_weight():
    # indicator row: BBB highest, then AAA, then CCC
    indicator_row = pd.Series({"AAA": 0.2, "BBB": 0.5, "CCC": 0.1})
    tradable = ["AAA", "BBB", "CCC"]
    sel = CrossSectionalSelection(mode="cross_sectional", rank_by="m", long_top=2, short_bottom=0)
    sizing = Sizing(scheme="equal_weight", gross_leverage=1.0)
    w = target_weights(sel, sizing, {"m": indicator_row}, tradable, prev_state={})
    assert w["BBB"] == 0.5
    assert w["AAA"] == 0.5
    assert "CCC" not in w


def test_cross_sectional_long_short():
    indicator_row = pd.Series({"AAA": 0.2, "BBB": 0.5, "CCC": 0.1, "DDD": -0.3})
    tradable = ["AAA", "BBB", "CCC", "DDD"]
    sel = CrossSectionalSelection(mode="cross_sectional", rank_by="m", long_top=1, short_bottom=1)
    sizing = Sizing(scheme="equal_weight", gross_leverage=1.0)
    w = target_weights(sel, sizing, {"m": indicator_row}, tradable, prev_state={})
    assert w["BBB"] == 0.5   # top long
    assert w["DDD"] == -0.5  # bottom short


def test_time_series_entry_then_hold_until_exit():
    sel = TimeSeriesSelection(
        mode="time_series",
        entry=Condition(indicator_id="r", op="<", value=30),
        exit=Condition(indicator_id="r", op=">", value=70),
    )
    sizing = Sizing(scheme="equal_weight", gross_leverage=1.0)
    tradable = ["AAA"]
    # rsi = 25 -> enter
    w1 = target_weights(sel, sizing, {"r": pd.Series({"AAA": 25.0})}, tradable, prev_state={})
    assert w1["AAA"] == 1.0
    # rsi = 50 -> neither entry nor exit -> hold prior long
    state = {"AAA": True}
    w2 = target_weights(sel, sizing, {"r": pd.Series({"AAA": 50.0})}, tradable, prev_state=state)
    assert w2["AAA"] == 1.0
    # rsi = 80 -> exit -> flat
    w3 = target_weights(sel, sizing, {"r": pd.Series({"AAA": 80.0})}, tradable, prev_state=state)
    assert w3.get("AAA", 0.0) == 0.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/engine/test_weights.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'hedgefund.engine.weights'`)

- [ ] **Step 3: Write the weights module**

`src/hedgefund/engine/weights.py`:
```python
from __future__ import annotations

import math

import pandas as pd

from hedgefund.dsl.spec import (
    CrossSectionalSelection,
    Selection,
    Sizing,
    TimeSeriesSelection,
)


def _eval_condition(value: float, op: str, threshold: float) -> bool:
    if value is None or math.isnan(value):
        return False
    return {
        "<": value < threshold,
        ">": value > threshold,
        "<=": value <= threshold,
        ">=": value >= threshold,
    }[op]


def target_weights(
    selection: Selection,
    sizing: Sizing,
    indicator_rows: dict[str, pd.Series],
    tradable: list[str],
    prev_state: dict[str, bool],
) -> dict[str, float]:
    """Return target weights {symbol: weight}. `prev_state` carries time-series
    position memory ({symbol: is_long}) and is mutated in place for that mode."""
    if isinstance(selection, CrossSectionalSelection):
        return _cross_sectional(selection, sizing, indicator_rows, tradable)
    if isinstance(selection, TimeSeriesSelection):
        return _time_series(selection, sizing, indicator_rows, tradable, prev_state)
    raise TypeError(f"unknown selection: {selection!r}")


def _cross_sectional(
    sel: CrossSectionalSelection,
    sizing: Sizing,
    indicator_rows: dict[str, pd.Series],
    tradable: list[str],
) -> dict[str, float]:
    row = indicator_rows[sel.rank_by].reindex(tradable).dropna()
    ranked = row.sort_values(ascending=False)
    longs = list(ranked.index[: sel.long_top])
    shorts = list(ranked.index[len(ranked) - sel.short_bottom :]) if sel.short_bottom else []
    n = len(longs) + len(shorts)
    if n == 0:
        return {}
    per = sizing.gross_leverage / n
    weights = {s: per for s in longs}
    weights.update({s: -per for s in shorts})
    return weights


def _time_series(
    sel: TimeSeriesSelection,
    sizing: Sizing,
    indicator_rows: dict[str, pd.Series],
    tradable: list[str],
    prev_state: dict[str, bool],
) -> dict[str, float]:
    entry_row = indicator_rows[sel.entry.indicator_id]
    exit_row = indicator_rows[sel.exit.indicator_id]
    active: list[str] = []
    for sym in tradable:
        is_long = prev_state.get(sym, False)
        entry_val = entry_row.get(sym, float("nan"))
        exit_val = exit_row.get(sym, float("nan"))
        if not is_long and _eval_condition(entry_val, sel.entry.op, sel.entry.value):
            is_long = True
        elif is_long and _eval_condition(exit_val, sel.exit.op, sel.exit.value):
            is_long = False
        prev_state[sym] = is_long
        if is_long:
            active.append(sym)
    if not active:
        return {}
    per = sizing.gross_leverage / len(active)
    return {s: per for s in active}
```

> `inverse_vol` sizing is intentionally not implemented yet (deferred per spec §9).
> `equal_weight` is the shipped scheme for Slice 1; `fixed_fraction` differentiation
> is a later add. Both currently resolve to equal magnitude.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/engine/test_weights.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/engine/weights.py tests/engine/test_weights.py
git commit -m "feat(engine): add selection+sizing target-weight computation"
```

---

### Task 7: Portfolio + order fills with costs

**Files:**
- Create: `src/hedgefund/engine/portfolio.py`
- Create: `src/hedgefund/engine/orders.py`
- Create: `tests/engine/test_orders.py`

- [ ] **Step 1: Write the failing tests**

`tests/engine/test_orders.py`:
```python
from hedgefund.engine.portfolio import Portfolio
from hedgefund.engine.orders import rebalance_to_weights


def test_buy_uses_fill_price_and_charges_costs():
    pf = Portfolio(cash=1000.0, positions={})
    # target 100% AAA, fill price 100, fee 10bps + slippage 5bps = 15bps
    fills = rebalance_to_weights(
        pf,
        target_weights={"AAA": 1.0},
        fill_prices={"AAA": 100.0},
        portfolio_value=1000.0,
        fee_bps=10.0,
        slippage_bps=5.0,
    )
    # target notional 1000 -> 10 units, cost = 1000 * 0.0015 = 1.5
    assert abs(pf.positions["AAA"] - 10.0) < 1e-9
    notional = pf.positions["AAA"] * 100.0
    assert abs(notional - 1000.0) < 1e-6
    assert abs(pf.cash - (1000.0 - notional - 1.5)) < 1e-6
    assert fills["AAA"] == pf.positions["AAA"]


def test_no_trade_when_already_on_target():
    pf = Portfolio(cash=0.0, positions={"AAA": 10.0})
    fills = rebalance_to_weights(
        pf,
        target_weights={"AAA": 1.0},
        fill_prices={"AAA": 100.0},
        portfolio_value=1000.0,
        fee_bps=10.0,
        slippage_bps=5.0,
    )
    assert fills == {}  # no delta -> no fills, no cost
    assert pf.cash == 0.0


def test_mark_to_market_value():
    pf = Portfolio(cash=500.0, positions={"AAA": 5.0})
    assert pf.value({"AAA": 100.0}) == 1000.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/engine/test_orders.py -v`
Expected: FAIL (`ModuleNotFoundError` for `hedgefund.engine.portfolio`)

- [ ] **Step 3: Write portfolio and orders**

`src/hedgefund/engine/portfolio.py`:
```python
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Portfolio:
    cash: float
    positions: dict[str, float] = field(default_factory=dict)  # symbol -> units

    def value(self, prices: dict[str, float]) -> float:
        total = self.cash
        for sym, units in self.positions.items():
            total += units * prices[sym]
        return total
```

`src/hedgefund/engine/orders.py`:
```python
from __future__ import annotations

from hedgefund.engine.portfolio import Portfolio

_EPS = 1e-9


def rebalance_to_weights(
    portfolio: Portfolio,
    target_weights: dict[str, float],
    fill_prices: dict[str, float],
    portfolio_value: float,
    fee_bps: float,
    slippage_bps: float,
) -> dict[str, float]:
    """Move the portfolio toward target weights, filling at `fill_prices`.

    Costs (fee + slippage) are charged on traded notional and debited from cash.
    Returns {symbol: filled_units_delta} for symbols actually traded. Mutates the
    portfolio in place.
    """
    cost_rate = (fee_bps + slippage_bps) / 1e4
    fills: dict[str, float] = {}
    symbols = set(target_weights) | set(portfolio.positions)
    for sym in symbols:
        price = fill_prices.get(sym)
        if price is None or price <= 0:
            continue
        target_units = target_weights.get(sym, 0.0) * portfolio_value / price
        current_units = portfolio.positions.get(sym, 0.0)
        delta = target_units - current_units
        if abs(delta) < _EPS:
            continue
        traded_notional = abs(delta) * price
        cost = traded_notional * cost_rate
        portfolio.cash -= delta * price + cost
        new_units = current_units + delta
        if abs(new_units) < _EPS:
            portfolio.positions.pop(sym, None)
        else:
            portfolio.positions[sym] = new_units
        fills[sym] = delta
    return fills
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/engine/test_orders.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/engine/portfolio.py src/hedgefund/engine/orders.py tests/engine/test_orders.py
git commit -m "feat(engine): add portfolio and cost-aware order fills"
```

---

### Task 8: Backtest event loop

**Files:**
- Create: `src/hedgefund/engine/backtest.py`
- Create: `tests/engine/test_backtest.py`

- [ ] **Step 1: Write the failing tests (buy-and-hold identity + fill timing)**

`tests/engine/test_backtest.py`:
```python
from datetime import date

from hedgefund.dsl.spec import (
    Costs,
    CrossSectionalSelection,
    MomentumIndicator,
    Sizing,
    StrategySpec,
)
from hedgefund.engine.backtest import run_backtest
from tests.fixtures.panels import single_asset_panel


def _hold_one_asset_spec(start, end, fee_bps=0.0, slippage_bps=0.0) -> StrategySpec:
    # momentum lookback 1, long_top 1 -> always holds the single asset once it has history
    return StrategySpec(
        name="hold",
        universe=["AAA"],
        indicators=[MomentumIndicator(type="momentum", id="m1", lookback=1)],
        selection=CrossSectionalSelection(
            mode="cross_sectional", rank_by="m1", long_top=1, short_bottom=0
        ),
        sizing=Sizing(scheme="equal_weight", gross_leverage=1.0),
        rebalance="daily",
        costs=Costs(fee_bps=fee_bps, slippage_bps=slippage_bps),
        start=start,
        end=end,
    )


def test_buy_and_hold_identity_no_costs():
    panel = single_asset_panel([100.0, 110.0, 121.0, 133.1])
    spec = _hold_one_asset_spec(date(2020, 1, 1), date(2020, 1, 4))
    result = run_backtest(spec, panel, starting_cash=1000.0)
    eq = result.equity_curve
    # Decision first possible at bar 1 (needs lookback 1), fills at bar 2 open=110.
    # Once fully long, terminal/entry equity ratio == price ratio over the holding window.
    held_return = 133.1 / 110.0
    entry_equity = eq.iloc[1]
    assert abs(eq.iloc[-1] / entry_equity - held_return) < 1e-6


def test_costs_reduce_terminal_equity():
    panel = single_asset_panel([100.0, 110.0, 121.0, 133.1])
    no_cost = run_backtest(
        _hold_one_asset_spec(date(2020, 1, 1), date(2020, 1, 4)), panel, starting_cash=1000.0
    )
    with_cost = run_backtest(
        _hold_one_asset_spec(date(2020, 1, 1), date(2020, 1, 4), fee_bps=10, slippage_bps=5),
        panel,
        starting_cash=1000.0,
    )
    assert with_cost.equity_curve.iloc[-1] < no_cost.equity_curve.iloc[-1]


def test_result_is_deterministic():
    panel = single_asset_panel([100.0, 110.0, 121.0, 133.1])
    spec = _hold_one_asset_spec(date(2020, 1, 1), date(2020, 1, 4))
    a = run_backtest(spec, panel, starting_cash=1000.0)
    b = run_backtest(spec, panel, starting_cash=1000.0)
    assert list(a.equity_curve) == list(b.equity_curve)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/engine/test_backtest.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'hedgefund.engine.backtest'`)

- [ ] **Step 3: Write the backtest loop**

`src/hedgefund/engine/backtest.py`:
```python
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.indicators import compute_all
from hedgefund.engine.orders import rebalance_to_weights
from hedgefund.engine.portfolio import Portfolio
from hedgefund.engine.weights import target_weights


@dataclass
class BacktestResult:
    equity_curve: pd.Series
    trade_log: pd.DataFrame
    spec: StrategySpec


def _is_rebalance_day(rebalance: str, ts: pd.Timestamp) -> bool:
    if rebalance == "daily":
        return True
    return ts.weekday() == 0  # weekly = Mondays


def run_backtest(spec: StrategySpec, panel, starting_cash: float = 10_000.0) -> BacktestResult:
    close = panel.close
    if isinstance(spec.universe, list):
        symbols = [s for s in spec.universe if s in close.columns]
        close = close[symbols]
    indicators = compute_all(spec.indicators, close)

    mask = (close.index >= pd.Timestamp(spec.start)) & (close.index <= pd.Timestamp(spec.end))
    dates = list(close.index[mask])

    pf = Portfolio(cash=starting_cash, positions={})
    ts_state: dict[str, bool] = {}
    pending_target: dict[str, float] | None = None
    prev_t: pd.Timestamp | None = None

    equity: list[float] = []
    trades: list[dict] = []

    for t in dates:
        # 1) Execute any target decided on the previous bar, at THIS bar's open.
        if pending_target is not None:
            tradable_now = [s for s in close.columns if panel.is_tradable(s, t)]
            fill_prices = {s: panel.open_at(s, t) for s in tradable_now}
            # value the portfolio at the prior close before trading
            if pf.positions and prev_t is not None:
                mark = {s: panel.close.loc[prev_t, s] for s in pf.positions}
                pv = pf.value(mark)
            else:
                pv = pf.cash
            fills = rebalance_to_weights(
                pf,
                target_weights={s: w for s, w in pending_target.items() if s in fill_prices},
                fill_prices=fill_prices,
                portfolio_value=pv,
                fee_bps=spec.costs.fee_bps,
                slippage_bps=spec.costs.slippage_bps,
            )
            for s, d in fills.items():
                trades.append({"date": t, "symbol": s, "units": d, "price": fill_prices[s]})
            pending_target = None

        # 2) Mark to market at THIS bar's close.
        mark_prices = {s: panel.close_at(s, t) for s in pf.positions if panel.is_tradable(s, t)}
        equity.append(pf.value(mark_prices))

        # 3) Decide a new target from data <= t, to be filled NEXT bar.
        if _is_rebalance_day(spec.rebalance, t):
            tradable = [s for s in close.columns if panel.is_tradable(s, t)]
            rows = {iid: frame.loc[t] for iid, frame in indicators.items()}
            pending_target = target_weights(spec.selection, spec.sizing, rows, tradable, ts_state)

        prev_t = t

    return BacktestResult(
        equity_curve=pd.Series(equity, index=pd.DatetimeIndex(dates), name="equity"),
        trade_log=pd.DataFrame(trades),
        spec=spec,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/engine/test_backtest.py -v`
Expected: PASS (3 passed)

If `test_buy_and_hold_identity_no_costs` is off by the entry-bar convention,
verify the timing against the fixture: decision at bar 1 (first bar with momentum
history), fill at bar 2 open (110), terminal mark at bar 3 close (133.1). Adjust
the asserted entry index **only** if the fixture's open/close convention differs —
do NOT weaken the "fills at next open" rule to force a pass.

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/engine/backtest.py tests/engine/test_backtest.py
git commit -m "feat(engine): add event-driven backtest loop (decide t, fill t+1)"
```

---

### Task 9: Risk metrics

**Files:**
- Create: `src/hedgefund/risk/__init__.py`
- Create: `src/hedgefund/risk/metrics.py`
- Create: `tests/risk/__init__.py`
- Create: `tests/risk/test_metrics.py`

- [ ] **Step 1: Write the failing tests**

`tests/risk/test_metrics.py`:
```python
import numpy as np
import pandas as pd

from hedgefund.risk.metrics import (
    max_drawdown,
    sharpe,
    total_return,
    value_at_risk,
    summarize,
)


def _equity(values) -> pd.Series:
    idx = pd.date_range("2020-01-01", periods=len(values), freq="D")
    return pd.Series(values, index=idx, dtype=float)


def test_total_return():
    eq = _equity([100, 110, 121])
    assert abs(total_return(eq) - 0.21) < 1e-9


def test_max_drawdown_known_value():
    eq = _equity([100, 120, 60, 90])  # peak 120 -> trough 60 = -50%
    assert abs(max_drawdown(eq) - (-0.5)) < 1e-9


def test_sharpe_of_constant_returns_is_finite():
    # constant positive daily return -> zero stdev -> guard returns 0.0, not nan/inf
    eq = _equity([100, 101, 102.01])
    assert np.isfinite(sharpe(eq))


def test_value_at_risk_95_historical_nonnegative():
    rets = pd.Series([-0.10, -0.05, 0.0, 0.02, 0.03])
    assert value_at_risk(rets, level=0.95) >= 0.0


def test_summarize_returns_expected_keys():
    eq = _equity([100, 110, 121, 133.1])
    out = summarize(eq, periods_per_year=365)
    for key in ("total_return", "cagr", "ann_vol", "sharpe", "sortino", "max_drawdown", "var_95"):
        assert key in out
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/risk/test_metrics.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'hedgefund.risk.metrics'`)

- [ ] **Step 3: Write the metrics**

`src/hedgefund/risk/__init__.py`: empty file.

`src/hedgefund/risk/metrics.py`:
```python
from __future__ import annotations

import numpy as np
import pandas as pd

PERIODS_PER_YEAR = 365


def returns(equity: pd.Series) -> pd.Series:
    return equity.pct_change().dropna()


def total_return(equity: pd.Series) -> float:
    return float(equity.iloc[-1] / equity.iloc[0] - 1.0)


def cagr(equity: pd.Series, periods_per_year: int = PERIODS_PER_YEAR) -> float:
    n = len(equity) - 1
    if n <= 0:
        return 0.0
    growth = equity.iloc[-1] / equity.iloc[0]
    return float(growth ** (periods_per_year / n) - 1.0)


def ann_vol(equity: pd.Series, periods_per_year: int = PERIODS_PER_YEAR) -> float:
    r = returns(equity)
    if r.empty:
        return 0.0
    return float(r.std(ddof=0) * np.sqrt(periods_per_year))


def sharpe(equity: pd.Series, periods_per_year: int = PERIODS_PER_YEAR) -> float:
    r = returns(equity)
    sd = r.std(ddof=0)
    if r.empty or sd == 0:
        return 0.0
    return float((r.mean() / sd) * np.sqrt(periods_per_year))


def sortino(equity: pd.Series, periods_per_year: int = PERIODS_PER_YEAR) -> float:
    r = returns(equity)
    downside = r[r < 0]
    dd = downside.std(ddof=0)
    if r.empty or dd == 0:
        return 0.0
    return float((r.mean() / dd) * np.sqrt(periods_per_year))


def max_drawdown(equity: pd.Series) -> float:
    running_max = equity.cummax()
    drawdown = equity / running_max - 1.0
    return float(drawdown.min())


def value_at_risk(rets: pd.Series, level: float = 0.95) -> float:
    if rets.empty:
        return 0.0
    q = np.quantile(rets, 1.0 - level)
    return float(-min(q, 0.0))


def cvar(rets: pd.Series, level: float = 0.95) -> float:
    if rets.empty:
        return 0.0
    threshold = np.quantile(rets, 1.0 - level)
    tail = rets[rets <= threshold]
    if tail.empty:
        return 0.0
    return float(-tail.mean())


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

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/risk/test_metrics.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/risk tests/risk
git commit -m "feat(risk): add pure-function performance metrics"
```

---

### Task 10: Data fetch + parquet cache (mocked CCXT)

**Files:**
- Create: `src/hedgefund/data/universe.py`
- Create: `src/hedgefund/data/cache.py`
- Create: `src/hedgefund/data/fetch.py`
- Create: `tests/data/test_cache.py`

- [ ] **Step 1: Write the failing tests**

`tests/data/test_cache.py`:
```python
from hedgefund.data.cache import write_symbol, read_symbol, cached_symbols
from hedgefund.data.fetch import ohlcv_to_frame


def test_ohlcv_rows_become_indexed_frame():
    # ccxt returns [ms_timestamp, open, high, low, close, volume]
    rows = [
        [1577836800000, 100.0, 105.0, 99.0, 104.0, 10.0],
        [1577923200000, 104.0, 106.0, 102.0, 103.0, 12.0],
    ]
    df = ohlcv_to_frame(rows)
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert str(df.index[0].date()) == "2020-01-01"
    assert df["close"].iloc[1] == 103.0


def test_cache_round_trip(tmp_path):
    df = ohlcv_to_frame([[1577836800000, 100.0, 105.0, 99.0, 104.0, 10.0]])
    write_symbol("BTC/USDT", df, cache_dir=tmp_path)
    back = read_symbol("BTC/USDT", cache_dir=tmp_path)
    assert back["close"].iloc[0] == 104.0
    assert "BTC/USDT" in cached_symbols(cache_dir=tmp_path)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/data/test_cache.py -v`
Expected: FAIL (`ModuleNotFoundError` for `hedgefund.data.cache`)

- [ ] **Step 3: Write universe, cache, fetch**

`src/hedgefund/data/universe.py`:
```python
from __future__ import annotations

# Explicit, version-controlled large-cap universe (quote = USDT on Binance).
# Chosen for liquidity + long history. No dynamic top-N (avoids survivorship bias).
DEFAULT_UNIVERSE: list[str] = [
    "BTC/USDT", "ETH/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT",
    "SOL/USDT", "DOGE/USDT", "DOT/USDT", "LTC/USDT", "BCH/USDT",
    "LINK/USDT", "XLM/USDT", "ETC/USDT", "TRX/USDT", "EOS/USDT",
    "ATOM/USDT", "XMR/USDT", "AAVE/USDT", "AVAX/USDT", "ALGO/USDT",
]
```

`src/hedgefund/data/cache.py`:
```python
from __future__ import annotations

from pathlib import Path

import pandas as pd

DEFAULT_CACHE_DIR = Path("data/cache")


def _safe_name(symbol: str) -> str:
    return symbol.replace("/", "_")


def write_symbol(symbol: str, df: pd.DataFrame, cache_dir: Path = DEFAULT_CACHE_DIR) -> Path:
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{_safe_name(symbol)}.parquet"
    df.to_parquet(path)
    return path


def read_symbol(symbol: str, cache_dir: Path = DEFAULT_CACHE_DIR) -> pd.DataFrame:
    path = Path(cache_dir) / f"{_safe_name(symbol)}.parquet"
    df = pd.read_parquet(path)
    if not df.index.is_monotonic_increasing:
        raise ValueError(f"cache for {symbol} is not time-sorted")
    return df


def cached_symbols(cache_dir: Path = DEFAULT_CACHE_DIR) -> list[str]:
    cache_dir = Path(cache_dir)
    if not cache_dir.exists():
        return []
    return [p.stem.replace("_", "/") for p in cache_dir.glob("*.parquet")]
```

`src/hedgefund/data/fetch.py`:
```python
from __future__ import annotations

import time

import pandas as pd

_COLUMNS = ["open", "high", "low", "close", "volume"]


def ohlcv_to_frame(rows: list[list[float]]) -> pd.DataFrame:
    """Convert ccxt OHLCV rows [ts_ms, o, h, l, c, v] to an indexed DataFrame."""
    if not rows:
        return pd.DataFrame(columns=_COLUMNS)
    df = pd.DataFrame(rows, columns=["ts", *_COLUMNS])
    df.index = pd.to_datetime(df["ts"], unit="ms")
    df.index.name = "date"
    return df[_COLUMNS]


def fetch_ohlcv(exchange, symbol: str, since_ms: int | None, limit: int = 1000) -> list[list[float]]:
    """Thin wrapper around ccxt fetch_ohlcv with retry/backoff. `exchange` is a
    ccxt exchange instance (injected so tests can pass a fake)."""
    for attempt in range(5):
        try:
            return exchange.fetch_ohlcv(symbol, timeframe="1d", since=since_ms, limit=limit)
        except Exception:  # noqa: BLE001 - ccxt raises many network error types
            if attempt == 4:
                raise
            time.sleep(2**attempt)
    return []
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/data/test_cache.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/data/universe.py src/hedgefund/data/cache.py src/hedgefund/data/fetch.py tests/data/test_cache.py
git commit -m "feat(data): add universe, parquet cache, and ccxt fetch helpers"
```

---

### Task 11: load_panel — assemble cache into a PricePanel

**Files:**
- Modify: `src/hedgefund/data/panel.py` (add imports + `load_panel`)
- Create: `tests/data/test_load_panel.py`

- [ ] **Step 1: Write the failing test**

`tests/data/test_load_panel.py`:
```python
from datetime import date

from hedgefund.data.cache import write_symbol
from hedgefund.data.fetch import ohlcv_to_frame
from hedgefund.data.panel import load_panel


def test_load_panel_aligns_symbols_and_marks_pre_listing_nan(tmp_path):
    # AAA listed both days; BBB only the second day -> first bar NaN for BBB
    aaa = ohlcv_to_frame(
        [
            [1577836800000, 10, 11, 9, 10.5, 1],     # 2020-01-01
            [1577923200000, 10.5, 12, 10, 11.0, 1],  # 2020-01-02
        ]
    )
    bbb = ohlcv_to_frame([[1577923200000, 20, 21, 19, 20.5, 1]])  # 2020-01-02 only
    write_symbol("AAA/USDT", aaa, cache_dir=tmp_path)
    write_symbol("BBB/USDT", bbb, cache_dir=tmp_path)

    panel = load_panel(
        ["AAA/USDT", "BBB/USDT"], date(2020, 1, 1), date(2020, 1, 2), cache_dir=tmp_path
    )
    d0 = panel.dates[0]
    assert panel.is_tradable("AAA/USDT", d0) is True
    assert panel.is_tradable("BBB/USDT", d0) is False  # pre-listing -> NaN
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/data/test_load_panel.py -v`
Expected: FAIL (`ImportError: cannot import name 'load_panel'`)

- [ ] **Step 3: Add imports and `load_panel` to panel.py**

At the TOP of `src/hedgefund/data/panel.py`, add these imports next to the existing ones:
```python
from pathlib import Path

from hedgefund.data.cache import DEFAULT_CACHE_DIR, read_symbol
```

At the END of `src/hedgefund/data/panel.py`, append:
```python
def load_panel(
    symbols: list[str],
    start: date,
    end: date,
    cache_dir: Path = DEFAULT_CACHE_DIR,
) -> PricePanel:
    """Assemble cached per-symbol frames into one aligned PricePanel.

    The union of all symbols' dates forms the index; a symbol missing a date
    (e.g. pre-listing) stays NaN and is therefore not tradable on that bar.
    """
    frames = {sym: read_symbol(sym, cache_dir=cache_dir) for sym in symbols}
    field_frames: dict[str, pd.DataFrame] = {}
    for fld in FIELDS:
        wide = pd.DataFrame({sym: frames[sym][fld] for sym in symbols}).sort_index()
        mask = (wide.index >= pd.Timestamp(start)) & (wide.index <= pd.Timestamp(end))
        field_frames[fld] = wide.loc[mask]
    return PricePanel.from_field_frames(field_frames)
```

> `date` is already imported at the top of the file (from Task 4); reuse it.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/data/test_load_panel.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/data/panel.py tests/data/test_load_panel.py
git commit -m "feat(data): assemble cached symbols into aligned PricePanel"
```

---

### Task 12: CLI (validate / run) + example specs + end-to-end test

**Files:**
- Create: `src/hedgefund/cli.py`
- Create: `specs/example_buy_and_hold.json`
- Create: `specs/example_momentum.json`
- Create: `tests/test_e2e.py`

- [ ] **Step 1: Write the failing end-to-end test**

`tests/test_e2e.py`:
```python
import json

from hedgefund.dsl.spec import StrategySpec
from hedgefund.dsl.validate import validate_spec
from hedgefund.engine.backtest import run_backtest
from hedgefund.risk.metrics import summarize
from tests.fixtures.panels import single_asset_panel


def test_example_momentum_spec_runs_end_to_end(tmp_path):
    spec_dict = {
        "name": "e2e",
        "universe": ["AAA"],
        "indicators": [{"type": "momentum", "id": "m1", "lookback": 1}],
        "selection": {"mode": "cross_sectional", "rank_by": "m1", "long_top": 1, "short_bottom": 0},
        "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
        "rebalance": "daily",
        "costs": {"fee_bps": 10, "slippage_bps": 5},
        "start": "2020-01-01",
        "end": "2020-01-05",
    }
    path = tmp_path / "spec.json"
    path.write_text(json.dumps(spec_dict))

    spec = StrategySpec.model_validate(json.loads(path.read_text()))
    validate_spec(spec)
    panel = single_asset_panel([100.0, 110.0, 121.0, 133.1, 146.41])
    result = run_backtest(spec, panel, starting_cash=10_000.0)
    metrics = summarize(result.equity_curve, periods_per_year=365)

    assert metrics["total_return"] > 0  # uptrending price, long strategy
    assert "sharpe" in metrics
    assert len(result.equity_curve) == 5
```

- [ ] **Step 2: Run test to verify it passes (library path already wired)**

Run: `python -m pytest tests/test_e2e.py -v`
Expected: PASS (this exercises the already-built library end-to-end; the CLI is added next).
If it FAILS, it reveals a wiring bug in an earlier task — fix that root cause before adding the CLI.

- [ ] **Step 3: Write the CLI and example specs**

`src/hedgefund/cli.py`:
```python
from __future__ import annotations

import json
from pathlib import Path

import typer

from hedgefund.data.cache import DEFAULT_CACHE_DIR
from hedgefund.data.panel import load_panel
from hedgefund.dsl.spec import StrategySpec
from hedgefund.dsl.validate import validate_spec
from hedgefund.engine.backtest import run_backtest
from hedgefund.risk.metrics import summarize

app = typer.Typer(help="Crypto hedge fund research core")


def _load_spec(spec_path: Path) -> StrategySpec:
    spec = StrategySpec.model_validate(json.loads(Path(spec_path).read_text()))
    validate_spec(spec)
    return spec


@app.command()
def validate(spec_path: Path) -> None:
    """Validate a strategy spec file without running it."""
    _load_spec(spec_path)
    typer.echo("OK: spec is valid")


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


if __name__ == "__main__":
    app()
```

`specs/example_buy_and_hold.json`:
```json
{
  "name": "btc_buy_and_hold",
  "universe": ["BTC/USDT"],
  "indicators": [{"type": "momentum", "id": "m1", "lookback": 1}],
  "selection": {"mode": "cross_sectional", "rank_by": "m1", "long_top": 1, "short_bottom": 0},
  "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
  "rebalance": "daily",
  "costs": {"fee_bps": 10, "slippage_bps": 5},
  "start": "2020-01-01",
  "end": "2024-01-01"
}
```

`specs/example_momentum.json`:
```json
{
  "name": "xsec_momentum_top5",
  "universe": ["BTC/USDT", "ETH/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "SOL/USDT", "DOGE/USDT", "DOT/USDT", "LTC/USDT", "LINK/USDT"],
  "indicators": [{"type": "momentum", "id": "m90", "lookback": 90}],
  "selection": {"mode": "cross_sectional", "rank_by": "m90", "long_top": 5, "short_bottom": 0},
  "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
  "rebalance": "weekly",
  "costs": {"fee_bps": 10, "slippage_bps": 5},
  "start": "2021-01-01",
  "end": "2024-01-01"
}
```

- [ ] **Step 4: Run the full test suite + CLI smoke**

Run:
```bash
python -m pytest -v
python -m hedgefund.cli validate specs/example_momentum.json
```
Expected: all tests PASS; CLI prints `OK: spec is valid`.

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/cli.py specs tests/test_e2e.py
git commit -m "feat(cli): add validate/run commands, example specs, e2e test"
```

---

### Task 13: fetch command + coverage gate

**Files:**
- Modify: `src/hedgefund/cli.py` (add `fetch` command)
- Create: `tests/data/test_fetch.py`

- [ ] **Step 1: Write the failing test (fetch with a fake exchange)**

`tests/data/test_fetch.py`:
```python
from hedgefund.data.fetch import fetch_ohlcv


class _FakeExchange:
    def __init__(self):
        self.calls = 0

    def fetch_ohlcv(self, symbol, timeframe, since, limit):
        self.calls += 1
        return [[1577836800000, 1, 2, 0.5, 1.5, 10]]


def test_fetch_ohlcv_calls_exchange_and_returns_rows():
    ex = _FakeExchange()
    rows = fetch_ohlcv(ex, "BTC/USDT", since_ms=None, limit=10)
    assert ex.calls == 1
    assert rows[0][4] == 1.5  # close
```

- [ ] **Step 2: Run test to verify it passes**

Run: `python -m pytest tests/data/test_fetch.py -v`
Expected: PASS (`fetch_ohlcv` exists from Task 10; this adds explicit coverage).
If it FAILS, align `fetch_ohlcv`'s signature to `(exchange, symbol, since_ms, limit)`.

- [ ] **Step 3: Add the `fetch` CLI command**

Insert into `src/hedgefund/cli.py` directly above the `if __name__ == "__main__":` line:
```python
@app.command()
def fetch(cache_dir: Path = DEFAULT_CACHE_DIR) -> None:
    """Fetch/refresh daily OHLCV for the default universe into the local cache."""
    import ccxt

    from hedgefund.data.cache import write_symbol
    from hedgefund.data.fetch import fetch_ohlcv, ohlcv_to_frame
    from hedgefund.data.universe import DEFAULT_UNIVERSE

    exchange = ccxt.binance({"enableRateLimit": True})
    for symbol in DEFAULT_UNIVERSE:
        rows = fetch_ohlcv(exchange, symbol, since_ms=None, limit=1000)
        frame = ohlcv_to_frame(rows)
        write_symbol(symbol, frame, cache_dir=cache_dir)
        typer.echo(f"cached {symbol}: {len(frame)} bars")
```

> History note: ccxt `fetch_ohlcv` returns at most `limit` bars from `since`.
> Full multi-year history needs pagination (loop advancing `since` by the last
> timestamp + 1 day until no new bars return). For Slice 1 the single-page fetch
> is an acceptable smoke run; pagination is a small follow-up before fetching real
> long-history data.

- [ ] **Step 4: Run the full suite with coverage**

Run:
```bash
python -m pytest --cov=hedgefund --cov-report=term-missing
```
Expected: all PASS; `hedgefund/engine` and `hedgefund/risk` each ≥ 80% coverage.
If engine/risk are below 80%, add targeted tests for uncovered branches
(weekly rebalance day, short_bottom path, cvar tail, rsi) before finishing.

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/cli.py tests/data/test_fetch.py
git commit -m "feat(cli): add fetch command; cover fetch helper"
```

---

## Self-Review (completed)

**Spec coverage check** — every spec section maps to a task:
- §3.1 Data layer → Tasks 4, 10, 11 (panel, cache/fetch, load_panel). Listing-date/NaN invariant covered by Task 4 + Task 11 tests.
- §3.2 Strategy DSL → Tasks 2, 3 (models + cross-reference validation).
- §3.3 Event-driven engine → Tasks 5–8 (indicators, weights, portfolio/orders, loop). Decide-`t`/fill-`t+1`, costs, guards covered.
- §3.4 Risk/analytics → Task 9. (BTC-benchmark information ratio: generic metrics ship now; explicit BTC-relative comparison is a thin add in Slice 2 once multiple equity curves are persisted — an acceptable Slice 1 scope trim.)
- §3.5 CLI → Tasks 12, 13 (validate/run/fetch).
- §6 Testing → known-answer fixtures (Task 4), lookahead guard (Task 5), fill timing + buy-and-hold identity (Task 8), cost accounting (Task 7), risk known values (Task 9), DSL validation (Task 3), coverage gate (Task 13).

**Deferred per spec §9 (intentional, not gaps):** `inverse_vol` sizing and
`fixed_fraction` differentiation (`equal_weight` ships first); full multi-year fetch
pagination (single-page smoke fetch in Slice 1).

**Placeholder scan:** none — every code step contains complete, runnable code.

**Type consistency:** `PricePanel`, `Portfolio`, `BacktestResult`, `StrategySpec`,
`target_weights`, `rebalance_to_weights`, `run_backtest`, `compute_all`/`compute_indicator`,
`summarize`, `load_panel`, `ohlcv_to_frame`, `fetch_ohlcv` are each defined once and
referenced with matching signatures across tasks.

**One execution caveat:** the buy-and-hold identity assertion (Task 8) depends on
the fixture convention `open[t] == close[t-1]`. Keep the "fill at next open" rule
fixed; adjust only the asserted entry index if the convention differs — never weaken
the timing rule to force a pass.
