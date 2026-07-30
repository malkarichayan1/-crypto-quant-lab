# LangGraph Agent UI — Implementation Plan

> **STATUS: COMPLETE.** All 12 tasks shipped in commits `735dfa7`…`c49de43` (Surface C).
> Verified 2026-07-29: all 28 files from the File Map exist, and the full test suite
> and dashboard build pass. Retained as a historical record — do not re-implement.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an autonomous LLM research loop (Research→Quant→Critic) that generates and back-tests trading strategies, streams iteration cards to the browser via SSE, and adds a Research section to the React dashboard.

**Architecture:** `runner.py` drives the loop with direct calls to pure node functions (research/quant/critic) in `graph.py`; each iteration's results are persisted to two new Postgres tables (`agent_runs`, `agent_iterations`) and pushed to a per-run `asyncio.Queue` that feeds an SSE endpoint. The existing backtests table is reused — every iteration's backtest is a normal `BacktestRow`. The React dashboard gets three new pages: agent form, live iteration timeline (SSE), and history list.

**Tech Stack:** Python — `anthropic>=0.30`, `langgraph>=0.2`, `pytest-asyncio`; TypeScript — native `EventSource` API (no new npm deps), TanStack Query, React Router.

---

## File Map

**Create:**
- `src/hedgefund/agents/__init__.py`
- `src/hedgefund/agents/prompts.py`
- `src/hedgefund/agents/llm.py`
- `src/hedgefund/agents/graph.py`
- `src/hedgefund/agents/runner.py`
- `src/hedgefund/api/db/agent_models.py`
- `src/hedgefund/api/db/agent_repository.py`
- `src/hedgefund/api/agent_schemas.py`
- `src/hedgefund/api/events.py`
- `src/hedgefund/api/routes/agent_runs.py`
- `migrations/versions/0002_add_agent_tables.py`
- `tests/agents/__init__.py`
- `tests/agents/test_prompts.py`
- `tests/agents/test_graph.py`
- `tests/agents/test_runner.py`
- `tests/api/test_agent_repository.py`
- `tests/api/test_agent_runs.py`
- `dashboard/src/api/agentRuns.ts`
- `dashboard/src/components/IterationCard.tsx`
- `dashboard/src/components/IterationCard.test.tsx`
- `dashboard/src/components/AgentRunCard.tsx`
- `dashboard/src/components/AgentRunCard.test.tsx`
- `dashboard/src/pages/AgentRunPage.tsx`
- `dashboard/src/pages/AgentRunPage.test.tsx`
- `dashboard/src/pages/AgentResultPage.tsx`
- `dashboard/src/pages/AgentResultPage.test.tsx`
- `dashboard/src/pages/AgentHistoryPage.tsx`
- `dashboard/src/pages/AgentHistoryPage.test.tsx`

**Modify:**
- `pyproject.toml` — add `anthropic`, `langgraph`, `pytest-asyncio`
- `src/hedgefund/api/config.py` — add `anthropic_api_key`, `anthropic_model`
- `src/hedgefund/api/app.py` — register agent_runs router, startup stale-run cleanup
- `src/hedgefund/api/deps.py` — add `get_call_llm` dependency
- `migrations/env.py` — import agent_models so alembic sees them
- `.env.example` — add `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
- `dashboard/src/types.ts` — add agent types
- `dashboard/src/App.tsx` — add Research routes
- `dashboard/src/components/NavBar.tsx` — add Research link
- `dashboard/src/styles/global.css` — agent UI styles

---

## Task 1: Dependencies + Config

**Files:**
- Modify: `pyproject.toml`
- Modify: `src/hedgefund/api/config.py`
- Modify: `.env.example`

- [x] **Step 1: Add Python dependencies**

Replace `pyproject.toml` `[project.optional-dependencies]`:

```toml
[project.optional-dependencies]
dev = ["pytest>=8", "pytest-cov>=5", "hypothesis>=6", "pytest-asyncio>=0.23"]
api = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.29",
    "sqlalchemy>=2.0",
    "alembic>=1.13",
    "psycopg[binary]>=3.1",
    "python-dotenv>=1.0",
    "httpx>=0.27",
    "anthropic>=0.30",
    "langgraph>=0.2,<0.3",
]
```

Also add to `[tool.pytest.ini_options]`:
```toml
asyncio_mode = "auto"
```

- [x] **Step 2: Update config.py**

Replace `src/hedgefund/api/config.py` entirely:

```python
from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

_DEFAULT_DB_URL = "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund"


class Settings:
    def __init__(
        self,
        database_url: str,
        anthropic_api_key: str | None,
        anthropic_model: str,
    ) -> None:
        self.database_url = database_url
        self.anthropic_api_key = anthropic_api_key
        self.anthropic_model = anthropic_model


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL", _DEFAULT_DB_URL),
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"),
        anthropic_model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
    )
```

- [x] **Step 3: Update .env.example**

Append to `.env.example`:
```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6
```

- [x] **Step 4: Install deps**

```powershell
.venv\Scripts\pip install -e ".[api,dev]"
```

Expected: successful install with `anthropic` and `langgraph` packages visible.

- [x] **Step 5: Commit**

```powershell
git add pyproject.toml src/hedgefund/api/config.py .env.example
git commit -m "feat(agents): add anthropic + langgraph deps, extend config"
```

---

## Task 2: Agent State + Prompts

**Files:**
- Create: `src/hedgefund/agents/__init__.py`
- Create: `src/hedgefund/agents/graph.py` (state TypedDict only for now)
- Create: `src/hedgefund/agents/prompts.py`

- [x] **Step 1: Write failing prompt tests**

Create `tests/agents/__init__.py` (empty).

Create `tests/agents/test_prompts.py`:

```python
from __future__ import annotations

from hedgefund.agents.prompts import (
    build_critic_messages,
    build_quant_messages,
    build_research_messages,
)
from hedgefund.agents.graph import AgentState


def _base_state() -> AgentState:
    return AgentState(
        goal="maximize sharpe",
        universe=["BTC/USDT", "ETH/USDT"],
        date_start="2022-01-01",
        date_end="2023-12-31",
        starting_cash=10000.0,
        budget_usd=1.0,
        target_metric="sharpe",
        target_value=1.5,
        iteration=0,
        cost_usd=0.0,
        done=False,
        research_note="",
        spec=None,
        backtest_id=None,
        metrics=None,
        critic_note="",
        prior_iterations=[],
    )


def test_research_messages_contain_goal():
    state = _base_state()
    msgs = build_research_messages(state)
    combined = " ".join(m["content"] for m in msgs)
    assert "maximize sharpe" in combined
    assert "BTC/USDT" in combined


def test_quant_messages_contain_research_note():
    state = {**_base_state(), "research_note": "use momentum indicator"}
    msgs = build_quant_messages(state)
    combined = " ".join(m["content"] for m in msgs)
    assert "momentum indicator" in combined


def test_quant_messages_with_prior_error():
    state = {**_base_state(), "research_note": "use sma"}
    msgs = build_quant_messages(state, prior_error="lookback must be > 0")
    combined = " ".join(m["content"] for m in msgs)
    assert "lookback must be > 0" in combined


def test_critic_messages_contain_target():
    state = {**_base_state(), "metrics": {"sharpe": 0.8, "total_return": 0.15}, "research_note": "r", "critic_note": ""}
    msgs = build_critic_messages(state)
    combined = " ".join(m["content"] for m in msgs)
    assert "sharpe" in combined
    assert "1.5" in combined
```

- [x] **Step 2: Run tests — expect import failure**

```powershell
.venv\Scripts\pytest tests/agents/test_prompts.py -v
```

Expected: `ModuleNotFoundError`.

- [x] **Step 3: Create `__init__.py`**

Create `src/hedgefund/agents/__init__.py` (empty file).

- [x] **Step 4: Create `graph.py` with AgentState**

Create `src/hedgefund/agents/graph.py`:

```python
from __future__ import annotations

from typing import TypedDict


class AgentState(TypedDict):
    # Immutable inputs
    goal: str
    universe: list[str]
    date_start: str          # "YYYY-MM-DD"
    date_end: str
    starting_cash: float
    budget_usd: float
    target_metric: str | None
    target_value: float | None

    # Loop counters / flags
    iteration: int
    cost_usd: float
    done: bool

    # Per-iteration LLM outputs (reset before each iteration starts)
    research_note: str
    spec: dict | None        # validated StrategySpec.model_dump() or None
    backtest_id: str | None  # UUID str of the created BacktestRow
    metrics: dict | None     # summarize() output

    # Filled by critic
    critic_note: str

    # Grows across iterations (used to build richer prompts)
    prior_iterations: list[dict]
```

- [x] **Step 5: Create `prompts.py`**

Create `src/hedgefund/agents/prompts.py`:

```python
from __future__ import annotations

import json

from hedgefund.agents.graph import AgentState

_DSL_SUMMARY = """
Available indicator types (include in "indicators" list):
  {"type": "momentum", "id": "<str>", "lookback": <int>}
  {"type": "sma",      "id": "<str>", "period": <int>}
  {"type": "rsi",      "id": "<str>", "period": <int>}
  {"type": "volatility","id": "<str>", "lookback": <int>}
  {"type": "zscore",   "id": "<str>", "source_id": "<indicator_id>", "lookback": <int>}

Selection modes:
  {"mode": "cross_sectional", "rank_by": "<indicator_id>", "long_top": <int>, "short_bottom": <int>}
  {"mode": "time_series", "entry": {"indicator_id":"<id>","op":">","value":<float>}, "exit": {...}}

Sizing schemes:
  {"scheme": "equal_weight", "gross_leverage": <float>}
  {"scheme": "inverse_vol",  "gross_leverage": <float>, "vol_indicator_id": "<indicator_id>"}
  {"scheme": "fixed_fraction","gross_leverage": <float>, "fraction": <float>}

Costs: {"fee_bps": <float>, "slippage_bps": <float>}
Rebalance: "daily" | "weekly"
"""

_SPEC_SCHEMA = """Return ONLY a JSON object with this shape (no prose):
{
  "name": "<descriptive strategy name>",
  "universe": ["BTC/USDT", ...],
  "indicators": [...],
  "selection": {...},
  "sizing": {...},
  "rebalance": "daily",
  "costs": {"fee_bps": 10, "slippage_bps": 5},
  "start": "YYYY-MM-DD",
  "end": "YYYY-MM-DD",
  "benchmark": "BTC/USDT"
}
"""


def build_research_messages(state: AgentState) -> list[dict]:
    prior_text = ""
    for p in state["prior_iterations"]:
        m = p.get("metrics") or {}
        sharpe = m.get("sharpe", "N/A")
        ret = m.get("total_return", "N/A")
        sharpe_str = f"{sharpe:.3f}" if isinstance(sharpe, float) else str(sharpe)
        ret_str = f"{ret:.3f}" if isinstance(ret, float) else str(ret)
        prior_text += (
            f"\nIteration {p['iteration']}: "
            f"sharpe={sharpe_str} "
            f"return={ret_str} | "
            f"critic: {p['critic_note'][:200]}"
        )

    system = (
        "You are a quantitative research agent designing crypto trading strategies. "
        "You have access to a backtesting engine. Your job: propose a strategy that "
        "performs well given the user's goal. Return a markdown research note with: "
        "hypothesis, proposed indicators, selection mode, sizing scheme, and expected edge."
        f"\n\nDSL capabilities:\n{_DSL_SUMMARY}"
    )
    user = (
        f"Goal: {state['goal']}\n"
        f"Universe: {', '.join(state['universe'])}\n"
        f"Period: {state['date_start']} to {state['date_end']}\n"
    )
    if prior_text:
        user += f"\nPrior iterations:{prior_text}"
    target = state.get("target_metric")
    if target:
        user += f"\nTarget: {target} >= {state['target_value']}"

    return [{"role": "user", "content": f"<system>{system}</system>\n\n{user}"}]


def build_quant_messages(
    state: AgentState, prior_error: str | None = None
) -> list[dict]:
    system = (
        "You are a quantitative spec writer. Given a research note, produce a "
        "StrategySpec JSON. Return ONLY valid JSON — no markdown, no explanation."
        f"\n\nDSL:\n{_DSL_SUMMARY}\n\nSchema:\n{_SPEC_SCHEMA}"
    )
    user = (
        f"Research note:\n{state['research_note']}\n\n"
        f"Universe: {json.dumps(state['universe'])}\n"
        f"Start: {state['date_start']}  End: {state['date_end']}"
    )
    if prior_error:
        user += f"\n\nYour previous attempt failed validation: {prior_error}\nFix it."

    return [{"role": "user", "content": f"<system>{system}</system>\n\n{user}"}]


def build_critic_messages(state: AgentState) -> list[dict]:
    metrics = state.get("metrics") or {}
    prior_text = "".join(
        f"\n  Iter {p['iteration']}: {p['critic_note'][:150]}"
        for p in state.get("prior_iterations", [])
    )
    target = state.get("target_metric")
    target_str = (
        f"{target} >= {state['target_value']}" if target else "no specific target"
    )
    system = (
        "You are a strategy critic. Evaluate the backtest results, decide whether "
        "to continue iterating, and give direction for the next iteration. "
        "End your response with EXACTLY this JSON on its own line: "
        '{"done": true/false, "reason": "<short reason>"}'
    )
    user = (
        f"Metrics: {json.dumps(metrics, indent=2)}\n"
        f"Target: {target_str}\n"
    )
    if prior_text:
        user += f"Prior critiques:{prior_text}\n"

    return [{"role": "user", "content": f"<system>{system}</system>\n\n{user}"}]
```

- [x] **Step 6: Run tests — expect pass**

```powershell
.venv\Scripts\pytest tests/agents/test_prompts.py -v
```

Expected: 4 passed.

- [x] **Step 7: Commit**

```powershell
git add src/hedgefund/agents/ tests/agents/
git commit -m "feat(agents): add AgentState TypedDict and prompt builders"
```

---

## Task 3: LLM Wrapper + Dependency

**Files:**
- Create: `src/hedgefund/agents/llm.py`
- Modify: `src/hedgefund/api/deps.py`

- [x] **Step 1: Create `llm.py`**

Create `src/hedgefund/agents/llm.py`:

```python
from __future__ import annotations

from collections.abc import Callable

import anthropic

# Pricing for claude-sonnet-4-6
_PRICE_INPUT = 3.0 / 1_000_000   # $3 per 1M input tokens
_PRICE_OUTPUT = 15.0 / 1_000_000  # $15 per 1M output tokens

CallLLM = Callable[[list[dict], str, int], tuple[str, float]]


def call_llm(
    messages: list[dict],
    model: str = "claude-sonnet-4-6",
    max_tokens: int = 2048,
) -> tuple[str, float]:
    """Call Anthropic Messages API. Returns (response_text, cost_usd)."""
    client = anthropic.Anthropic()
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        messages=messages,
    )
    text = response.content[0].text
    cost = (
        response.usage.input_tokens * _PRICE_INPUT
        + response.usage.output_tokens * _PRICE_OUTPUT
    )
    return text, cost
```

- [x] **Step 2: Add `get_call_llm` to `deps.py`**

Read the current `src/hedgefund/api/deps.py` first, then append:

```python
from hedgefund.agents.llm import CallLLM, call_llm as _call_llm


def get_call_llm() -> CallLLM:
    """FastAPI dependency returning the Anthropic LLM caller.

    Override in tests via app.dependency_overrides[get_call_llm].
    """
    return _call_llm
```

- [x] **Step 3: Commit**

```powershell
git add src/hedgefund/agents/llm.py src/hedgefund/api/deps.py
git commit -m "feat(agents): add LLM wrapper + injectable dependency"
```

---

## Task 4: Node Functions

**Files:**
- Modify: `src/hedgefund/agents/graph.py` (add node functions below the TypedDict)
- Create: `tests/agents/test_graph.py`

- [x] **Step 1: Write failing node function tests**

Create `tests/agents/test_graph.py`:

```python
from __future__ import annotations

import json

import pytest

from hedgefund.agents.graph import (
    AgentState,
    research_node,
    quant_node,
    parse_critic_response,
)


def _base_state() -> AgentState:
    return AgentState(
        goal="beat the market",
        universe=["BTC/USDT"],
        date_start="2022-01-01",
        date_end="2023-12-31",
        starting_cash=10000.0,
        budget_usd=5.0,
        target_metric="sharpe",
        target_value=1.0,
        iteration=0,
        cost_usd=0.0,
        done=False,
        research_note="",
        spec=None,
        backtest_id=None,
        metrics=None,
        critic_note="",
        prior_iterations=[],
    )


def _mock_llm(responses: list[str]):
    calls = iter(responses)
    def _fn(messages, model="x", max_tokens=2048):
        return next(calls), 0.001
    return _fn


def test_research_node_sets_note_and_cost():
    state = _base_state()
    mock = _mock_llm(["Use momentum strategy with 20-day lookback."])
    result = research_node(state, mock)
    assert result["research_note"] == "Use momentum strategy with 20-day lookback."
    assert result["cost_usd"] == pytest.approx(0.001)


def test_quant_node_parses_valid_spec():
    spec_json = {
        "name": "BTC Momentum",
        "universe": ["BTC/USDT"],
        "indicators": [{"type": "momentum", "id": "m1", "lookback": 20}],
        "selection": {"mode": "cross_sectional", "rank_by": "m1", "long_top": 1, "short_bottom": 0},
        "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
        "rebalance": "daily",
        "costs": {"fee_bps": 10, "slippage_bps": 5},
        "start": "2022-01-01",
        "end": "2023-12-31",
        "benchmark": "BTC/USDT",
    }
    state = {**_base_state(), "research_note": "use momentum"}
    mock = _mock_llm([json.dumps(spec_json)])
    result = quant_node(state, mock)
    assert result["spec"] is not None
    assert result["spec"]["name"] == "BTC Momentum"
    assert result["cost_usd"] == pytest.approx(0.001)


def test_quant_node_returns_none_spec_on_invalid_json():
    state = {**_base_state(), "research_note": "use sma"}
    mock = _mock_llm(["not valid json at all!!!"])
    result = quant_node(state, mock)
    assert result["spec"] is None
    assert result["quant_error"] is not None


def test_parse_critic_response_done_true():
    text = 'The strategy is good.\n{"done": true, "reason": "target reached"}'
    done, note, _ = parse_critic_response(text)
    assert done is True
    assert "target reached" in note


def test_parse_critic_response_done_false():
    text = 'Needs improvement.\n{"done": false, "reason": "sharpe too low"}'
    done, note, _ = parse_critic_response(text)
    assert done is False


def test_parse_critic_response_fallback_on_no_json():
    text = "This strategy has issues with volatility."
    done, note, _ = parse_critic_response(text)
    assert done is False
    assert "volatility" in note
```

- [x] **Step 2: Run tests — expect import failure**

```powershell
.venv\Scripts\pytest tests/agents/test_graph.py -v
```

Expected: `ImportError` (functions not yet defined).

- [x] **Step 3: Add node functions to `graph.py`**

Append to `src/hedgefund/agents/graph.py` (after the TypedDict):

```python
import json
import re

from hedgefund.agents.llm import CallLLM
from hedgefund.agents.prompts import (
    build_critic_messages,
    build_quant_messages,
    build_research_messages,
)
from hedgefund.dsl.spec import StrategySpec
from hedgefund.dsl.validate import validate_spec


def research_node(state: AgentState, call_llm: CallLLM) -> dict:
    """Call LLM to produce a research note. Returns partial state update."""
    messages = build_research_messages(state)
    text, cost = call_llm(messages)
    return {
        "research_note": text,
        "cost_usd": state["cost_usd"] + cost,
    }


def quant_node(
    state: AgentState, call_llm: CallLLM, prior_error: str | None = None
) -> dict:
    """Call LLM to produce a StrategySpec JSON. Returns partial state update."""
    messages = build_quant_messages(state, prior_error=prior_error)
    text, cost = call_llm(messages)
    spec = None
    error = None
    try:
        raw = json.loads(text)
        candidate = StrategySpec(**raw)
        validate_spec(candidate)
        spec = candidate.model_dump(mode="json")
    except Exception as exc:
        error = str(exc)
    return {
        "spec": spec,
        "quant_error": error,
        "cost_usd": state["cost_usd"] + cost,
    }


def parse_critic_response(text: str) -> tuple[bool, str, str]:
    """Parse critic LLM output. Returns (done, critic_note, reason)."""
    match = re.search(r'\{[^{}]*"done"\s*:\s*(true|false)[^{}]*\}', text)
    if match:
        try:
            obj = json.loads(match.group(0))
            done = bool(obj.get("done", False))
            reason = str(obj.get("reason", ""))
            note = text[: match.start()].strip() or text
            return done, note, reason
        except json.JSONDecodeError:
            pass
    return False, text, ""


def critic_node(state: AgentState, call_llm: CallLLM) -> dict:
    """Call LLM to evaluate results and decide whether to continue."""
    messages = build_critic_messages(state)
    text, cost = call_llm(messages)
    done, critic_note, _ = parse_critic_response(text)

    # Also terminate if target is met
    if not done and state.get("target_metric") and state.get("metrics"):
        metric_val = state["metrics"].get(state["target_metric"])
        if metric_val is not None and metric_val >= (state["target_value"] or 0):
            done = True

    return {
        "critic_note": critic_note,
        "done": done,
        "cost_usd": state["cost_usd"] + cost,
    }
```

Note: `graph.py` needs `from __future__ import annotations` at the top. The TypedDict is already defined there; add the imports and functions after it. Keep the file under 150 lines total — if `validate_spec` or `StrategySpec` imports fail, check `src/hedgefund/dsl/` for the correct module path and adjust.

- [x] **Step 4: Run tests — expect pass**

```powershell
.venv\Scripts\pytest tests/agents/test_graph.py -v
```

Expected: 6 passed.

- [x] **Step 5: Commit**

```powershell
git add src/hedgefund/agents/graph.py tests/agents/test_graph.py
git commit -m "feat(agents): add research/quant/critic node functions with tests"
```

---

## Task 5: DB Models + Migration

**Files:**
- Create: `src/hedgefund/api/db/agent_models.py`
- Create: `migrations/versions/0002_add_agent_tables.py`
- Modify: `migrations/env.py`

- [x] **Step 1: Create `agent_models.py`**

Create `src/hedgefund/api/db/agent_models.py`:

```python
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from hedgefund.api.db.models import Base


class AgentRunRow(Base):
    __tablename__ = "agent_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    universe: Mapped[list] = mapped_column(JSONB, nullable=False)
    date_start: Mapped[date] = mapped_column(Date, nullable=False)
    date_end: Mapped[date] = mapped_column(Date, nullable=False)
    starting_cash: Mapped[float] = mapped_column(Float, nullable=False)
    budget_usd: Mapped[float] = mapped_column(Float, nullable=False)
    target_metric: Mapped[str | None] = mapped_column(String, nullable=True)
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    model: Mapped[str] = mapped_column(String, nullable=False, default="claude-sonnet-4-6")
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    winner_backtest_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("backtests.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentIterationRow(Base):
    __tablename__ = "agent_iterations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_runs.id"), nullable=False
    )
    iteration_index: Mapped[int] = mapped_column(Integer, nullable=False)
    research_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    spec_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    backtest_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("backtests.id"), nullable=True
    )
    metrics_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    critic_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    failed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [x] **Step 2: Update `migrations/env.py`**

Read the current `migrations/env.py`. Add the agent_models import after the existing Base import:

```python
from hedgefund.api.db import agent_models as _agent_models  # noqa: F401
```

This line must appear before `target_metadata = Base.metadata` so Alembic detects the new tables.

- [x] **Step 3: Create migration file**

Create `migrations/versions/0002_add_agent_tables.py`:

```python
"""add agent_runs and agent_iterations tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("universe", postgresql.JSONB(), nullable=False),
        sa.Column("date_start", sa.Date(), nullable=False),
        sa.Column("date_end", sa.Date(), nullable=False),
        sa.Column("starting_cash", sa.Float(), nullable=False),
        sa.Column("budget_usd", sa.Float(), nullable=False),
        sa.Column("target_metric", sa.String(), nullable=True),
        sa.Column("target_value", sa.Float(), nullable=True),
        sa.Column("model", sa.String(), nullable=False, server_default="claude-sonnet-4-6"),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("winner_backtest_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("backtests.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "agent_iterations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("agent_runs.id"), nullable=False),
        sa.Column("iteration_index", sa.Integer(), nullable=False),
        sa.Column("research_note", sa.Text(), nullable=True),
        sa.Column("spec_json", postgresql.JSONB(), nullable=True),
        sa.Column("backtest_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("backtests.id"), nullable=True),
        sa.Column("metrics_snapshot", postgresql.JSONB(), nullable=True),
        sa.Column("critic_note", sa.Text(), nullable=True),
        sa.Column("failed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("agent_iterations")
    op.drop_table("agent_runs")
```

- [x] **Step 4: Run migration against local DB**

```powershell
.venv\Scripts\alembic upgrade head
```

Expected: runs migration 0002, creates `agent_runs` and `agent_iterations` tables.

- [x] **Step 5: Commit**

```powershell
git add src/hedgefund/api/db/agent_models.py migrations/versions/0002_add_agent_tables.py migrations/env.py
git commit -m "feat(agents): add agent_runs + agent_iterations ORM models and migration"
```

---

## Task 6: Agent Repository

**Files:**
- Create: `src/hedgefund/api/db/agent_repository.py`
- Create: `tests/api/test_agent_repository.py`

- [x] **Step 1: Write failing repository tests**

Create `tests/api/test_agent_repository.py`:

```python
from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from hedgefund.api.db.agent_repository import AgentRepository
from hedgefund.api.db.models import Base
from hedgefund.api.db import agent_models as _  # noqa: F401

import os
_TEST_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test",
)


@pytest.fixture(scope="session")
def agent_engine():
    eng = create_engine(_TEST_URL, future=True)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def agent_session(agent_engine):
    conn = agent_engine.connect()
    trans = conn.begin()
    Sess = sessionmaker(bind=conn, autoflush=False, expire_on_commit=False)
    sess = Sess()
    try:
        yield sess
    finally:
        sess.close()
        trans.rollback()
        conn.close()


def _run_kwargs():
    return dict(
        goal="maximize sharpe",
        universe=["BTC/USDT"],
        date_start=date(2022, 1, 1),
        date_end=date(2023, 12, 31),
        starting_cash=10000.0,
        budget_usd=1.0,
        target_metric="sharpe",
        target_value=1.5,
        model="claude-sonnet-4-6",
    )


def test_create_and_get_run(agent_session):
    repo = AgentRepository(agent_session)
    run = repo.create_run(**_run_kwargs())
    agent_session.commit()
    agent_session.refresh(run)

    fetched = repo.get_run(run.id)
    assert fetched is not None
    assert fetched.goal == "maximize sharpe"
    assert fetched.status == "pending"


def test_list_runs(agent_session):
    repo = AgentRepository(agent_session)
    repo.create_run(**_run_kwargs())
    repo.create_run(**_run_kwargs())
    agent_session.commit()
    runs = repo.list_runs()
    assert len(runs) >= 2


def test_update_run_status(agent_session):
    repo = AgentRepository(agent_session)
    run = repo.create_run(**_run_kwargs())
    agent_session.commit()
    agent_session.refresh(run)

    repo.update_run_status(run.id, "running")
    agent_session.commit()
    agent_session.refresh(run)
    assert run.status == "running"


def test_create_iteration(agent_session):
    repo = AgentRepository(agent_session)
    run = repo.create_run(**_run_kwargs())
    agent_session.commit()
    agent_session.refresh(run)

    it = repo.create_iteration(
        run_id=run.id,
        iteration_index=0,
        research_note="use momentum",
        spec_json={"name": "test"},
        backtest_id=None,
        metrics_snapshot={"sharpe": 0.5},
        critic_note="not good enough",
        failed=False,
    )
    agent_session.commit()
    agent_session.refresh(it)
    assert it.iteration_index == 0
    assert it.metrics_snapshot["sharpe"] == 0.5


def test_list_iterations(agent_session):
    repo = AgentRepository(agent_session)
    run = repo.create_run(**_run_kwargs())
    agent_session.commit()
    agent_session.refresh(run)

    repo.create_iteration(run_id=run.id, iteration_index=0, research_note="r",
                          spec_json=None, backtest_id=None, metrics_snapshot=None,
                          critic_note="c", failed=True)
    agent_session.commit()
    iters = repo.list_iterations(run.id)
    assert len(iters) == 1
```

- [x] **Step 2: Run tests — expect import failure**

```powershell
.venv\Scripts\pytest tests/api/test_agent_repository.py -v
```

Expected: `ModuleNotFoundError`.

- [x] **Step 3: Create `agent_repository.py`**

Create `src/hedgefund/api/db/agent_repository.py`:

```python
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select, update as sa_update
from sqlalchemy.orm import Session

from hedgefund.api.db.agent_models import AgentIterationRow, AgentRunRow


class AgentRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def create_run(
        self,
        *,
        goal: str,
        universe: list[str],
        date_start: date,
        date_end: date,
        starting_cash: float,
        budget_usd: float,
        target_metric: str | None,
        target_value: float | None,
        model: str,
    ) -> AgentRunRow:
        row = AgentRunRow(
            id=uuid.uuid4(),
            goal=goal,
            universe=universe,
            date_start=date_start,
            date_end=date_end,
            starting_cash=starting_cash,
            budget_usd=budget_usd,
            target_metric=target_metric,
            target_value=target_value,
            model=model,
            status="pending",
            cost_usd=0.0,
        )
        self._s.add(row)
        self._s.flush()
        return row

    def get_run(self, run_id: uuid.UUID) -> AgentRunRow | None:
        return self._s.get(AgentRunRow, run_id)

    def list_runs(self) -> list[AgentRunRow]:
        stmt = select(AgentRunRow).order_by(AgentRunRow.created_at.desc())
        return list(self._s.scalars(stmt).all())

    def update_run_status(self, run_id: uuid.UUID, status: str) -> None:
        self._s.execute(
            sa_update(AgentRunRow)
            .where(AgentRunRow.id == run_id)
            .values(status=status)
        )

    def update_run_cost(self, run_id: uuid.UUID, cost_usd: float) -> None:
        self._s.execute(
            sa_update(AgentRunRow)
            .where(AgentRunRow.id == run_id)
            .values(cost_usd=cost_usd)
        )

    def finish_run(
        self,
        run_id: uuid.UUID,
        *,
        cost_usd: float,
        winner_backtest_id: uuid.UUID | None,
        status: str = "done",
    ) -> None:
        self._s.execute(
            sa_update(AgentRunRow)
            .where(AgentRunRow.id == run_id)
            .values(
                status=status,
                cost_usd=cost_usd,
                winner_backtest_id=winner_backtest_id,
                finished_at=datetime.now(timezone.utc),
            )
        )

    def list_iterations(self, run_id: uuid.UUID) -> list[AgentIterationRow]:
        stmt = (
            select(AgentIterationRow)
            .where(AgentIterationRow.run_id == run_id)
            .order_by(AgentIterationRow.iteration_index)
        )
        return list(self._s.scalars(stmt).all())

    def create_iteration(
        self,
        *,
        run_id: uuid.UUID,
        iteration_index: int,
        research_note: str | None,
        spec_json: dict | None,
        backtest_id: uuid.UUID | None,
        metrics_snapshot: dict | None,
        critic_note: str | None,
        failed: bool,
    ) -> AgentIterationRow:
        row = AgentIterationRow(
            id=uuid.uuid4(),
            run_id=run_id,
            iteration_index=iteration_index,
            research_note=research_note,
            spec_json=spec_json,
            backtest_id=backtest_id,
            metrics_snapshot=metrics_snapshot,
            critic_note=critic_note,
            failed=failed,
        )
        self._s.add(row)
        self._s.flush()
        return row

    def mark_stale_runs_failed(self) -> int:
        """On startup: mark any 'running'/'pending' runs as 'failed'."""
        result = self._s.execute(
            sa_update(AgentRunRow)
            .where(AgentRunRow.status.in_(["running", "pending"]))
            .values(status="failed", finished_at=datetime.now(timezone.utc))
        )
        return result.rowcount
```

- [x] **Step 4: Run tests — expect pass**

```powershell
.venv\Scripts\pytest tests/api/test_agent_repository.py -v
```

Expected: 5 passed.

- [x] **Step 5: Commit**

```powershell
git add src/hedgefund/api/db/agent_repository.py tests/api/test_agent_repository.py
git commit -m "feat(agents): add AgentRepository with CRUD for runs and iterations"
```

---

## Task 7: SSE Event Bus + Runner

**Files:**
- Create: `src/hedgefund/api/events.py`
- Create: `src/hedgefund/agents/runner.py`
- Create: `tests/agents/test_runner.py`

- [x] **Step 1: Create `events.py`**

Create `src/hedgefund/api/events.py`:

```python
from __future__ import annotations

import asyncio
import uuid

_queues: dict[uuid.UUID, asyncio.Queue] = {}


def create_queue(run_id: uuid.UUID) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _queues[run_id] = q
    return q


def get_queue(run_id: uuid.UUID) -> asyncio.Queue | None:
    return _queues.get(run_id)


def remove_queue(run_id: uuid.UUID) -> None:
    _queues.pop(run_id, None)
```

- [x] **Step 2: Create `runner.py`**

Create `src/hedgefund/agents/runner.py`:

```python
from __future__ import annotations

import asyncio
import time
import uuid
from datetime import date

from hedgefund.agents.graph import (
    AgentState,
    critic_node,
    quant_node,
    research_node,
)
from hedgefund.agents.llm import CallLLM
from hedgefund.api.db.agent_repository import AgentRepository
from hedgefund.api.db.repository import BacktestRepository
from hedgefund.api.serialization import curve_to_json, trades_to_json
from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.backtest import run_backtest
from hedgefund.risk.metrics import summarize

MAX_ITERATIONS = 20


def _run_research(state: AgentState, call_llm: CallLLM) -> dict:
    return research_node(state, call_llm)


def _run_quant_with_retry(state: AgentState, call_llm: CallLLM) -> dict:
    result = quant_node(state, call_llm)
    if result["spec"] is None:
        accumulated_cost = result["cost_usd"]
        for _ in range(2):
            retry_state = {**state, "cost_usd": state["cost_usd"] + accumulated_cost}
            retry = quant_node(retry_state, call_llm, prior_error=result.get("quant_error"))
            accumulated_cost += retry["cost_usd"]
            if retry["spec"] is not None:
                return {**retry, "cost_usd": state["cost_usd"] + accumulated_cost}
            result["quant_error"] = retry.get("quant_error")
        result["cost_usd"] = state["cost_usd"] + accumulated_cost
    return result


def _run_backtest_sync(
    spec_dict: dict,
    date_start: str,
    date_end: str,
    starting_cash: float,
    panel_loader,
    session,
) -> tuple[uuid.UUID | None, dict | None]:
    spec = StrategySpec(**spec_dict)
    symbols = list(dict.fromkeys([*spec.universe, spec.benchmark]))
    try:
        panel = panel_loader(
            symbols,
            date.fromisoformat(date_start),
            date.fromisoformat(date_end),
        )
    except FileNotFoundError:
        return None, None

    t0 = time.perf_counter()
    result = run_backtest(spec, panel, starting_cash=starting_cash)
    duration_ms = int((time.perf_counter() - t0) * 1000)

    if result.benchmark_curve is not None:
        metrics = summarize(result.equity_curve, benchmark=result.benchmark_curve)
    else:
        metrics = summarize(result.equity_curve)

    repo = BacktestRepository(session)
    row = repo.create(
        name=spec.name,
        spec=spec.model_dump(mode="json"),
        equity_curve=curve_to_json(result.equity_curve),
        benchmark_curve=curve_to_json(result.benchmark_curve),
        trade_log=trades_to_json(result.trade_log),
        metrics=metrics,
        starting_cash=starting_cash,
        duration_ms=duration_ms,
    )
    session.commit()
    session.refresh(row)
    return row.id, metrics


def _run_critic(state: AgentState, call_llm: CallLLM) -> dict:
    return critic_node(state, call_llm)


def _find_winner(
    iterations: list, target_metric: str | None, target_value: float | None
) -> uuid.UUID | None:
    candidates = [
        it for it in iterations
        if it.backtest_id is not None and it.metrics_snapshot
    ]
    if not candidates:
        return None
    key_metric = target_metric or "sharpe"
    scored = sorted(
        candidates,
        key=lambda it: it.metrics_snapshot.get(key_metric, float("-inf")),
        reverse=True,
    )
    return scored[0].backtest_id if scored else None


async def run_agent_loop(
    *,
    run_id: uuid.UUID,
    goal: str,
    universe: list[str],
    date_start: str,
    date_end: str,
    starting_cash: float,
    budget_usd: float,
    target_metric: str | None,
    target_value: float | None,
    model: str,
    call_llm: CallLLM,
    session_factory,
    panel_loader,
    event_queue: asyncio.Queue,
) -> None:
    session = session_factory()
    agent_repo = AgentRepository(session)

    state: AgentState = AgentState(
        goal=goal,
        universe=universe,
        date_start=date_start,
        date_end=date_end,
        starting_cash=starting_cash,
        budget_usd=budget_usd,
        target_metric=target_metric,
        target_value=target_value,
        iteration=0,
        cost_usd=0.0,
        done=False,
        research_note="",
        spec=None,
        backtest_id=None,
        metrics=None,
        critic_note="",
        prior_iterations=[],
    )

    try:
        await event_queue.put(
            {"type": "run_started", "run_id": str(run_id), "goal": goal, "status": "running"}
        )
        await asyncio.to_thread(agent_repo.update_run_status, run_id, "running")
        session.commit()

        for iteration in range(MAX_ITERATIONS):
            if state["done"] or state["cost_usd"] >= budget_usd:
                break

            # Research
            r_update = await asyncio.to_thread(_run_research, state, call_llm)
            state = {**state, **r_update, "iteration": iteration}
            await asyncio.to_thread(agent_repo.update_run_cost, run_id, state["cost_usd"])
            session.commit()

            # Quant (with internal retry)
            q_update = await asyncio.to_thread(_run_quant_with_retry, state, call_llm)
            state = {**state, **q_update}
            await asyncio.to_thread(agent_repo.update_run_cost, run_id, state["cost_usd"])
            session.commit()

            # Backtest
            backtest_id = None
            metrics = None
            if state["spec"] is not None:
                backtest_id, metrics = await asyncio.to_thread(
                    _run_backtest_sync,
                    state["spec"],
                    date_start,
                    date_end,
                    starting_cash,
                    panel_loader,
                    session,
                )
            state = {
                **state,
                "backtest_id": str(backtest_id) if backtest_id else None,
                "metrics": metrics,
            }

            # Critic
            c_update = await asyncio.to_thread(_run_critic, state, call_llm)
            state = {**state, **c_update}
            await asyncio.to_thread(agent_repo.update_run_cost, run_id, state["cost_usd"])
            session.commit()

            # Persist iteration
            await asyncio.to_thread(
                agent_repo.create_iteration,
                run_id=run_id,
                iteration_index=iteration,
                research_note=state["research_note"],
                spec_json=state["spec"],
                backtest_id=backtest_id,
                metrics_snapshot=metrics,
                critic_note=state["critic_note"],
                failed=(state["spec"] is None),
            )
            session.commit()

            await event_queue.put({
                "type": "iteration_complete",
                "iteration_index": iteration,
                "research_note": state["research_note"],
                "spec_json": state["spec"],
                "backtest_id": str(backtest_id) if backtest_id else None,
                "metrics": metrics,
                "critic_note": state["critic_note"],
                "failed": state["spec"] is None,
                "cost_usd": state["cost_usd"],
            })

            state["prior_iterations"].append({
                "iteration": iteration,
                "research_note": state["research_note"],
                "metrics": metrics,
                "critic_note": state["critic_note"],
            })

            if state["done"]:
                break

        iterations = await asyncio.to_thread(agent_repo.list_iterations, run_id)
        winner_id = _find_winner(iterations, target_metric, target_value)
        await asyncio.to_thread(
            agent_repo.finish_run,
            run_id,
            cost_usd=state["cost_usd"],
            winner_backtest_id=winner_id,
            status="done",
        )
        session.commit()

        await event_queue.put({
            "type": "run_done",
            "status": "done",
            "cost_usd": state["cost_usd"],
            "winner_backtest_id": str(winner_id) if winner_id else None,
        })

    except Exception as exc:
        try:
            agent_repo.finish_run(
                run_id,
                cost_usd=state.get("cost_usd", 0.0),
                winner_backtest_id=None,
                status="failed",
            )
            session.commit()
        except Exception:
            pass
        await event_queue.put({"type": "run_done", "status": "failed", "error": str(exc)})
    finally:
        session.close()
        await event_queue.put(None)  # sentinel
```

- [x] **Step 3: Write runner tests**

Create `tests/agents/test_runner.py`:

```python
from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from hedgefund.agents.runner import run_agent_loop
from hedgefund.api.db.models import Base
from hedgefund.api.db import agent_models as _  # noqa: F401
from hedgefund.api.db.agent_repository import AgentRepository

_TEST_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test",
)


@pytest.fixture(scope="session")
def runner_engine():
    eng = create_engine(_TEST_URL, future=True)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def session_factory(runner_engine):
    return sessionmaker(bind=runner_engine, autoflush=False, expire_on_commit=False)


@pytest.mark.asyncio
async def test_runner_budget_zero_exits_immediately(session_factory, runner_engine):
    """With budget=0, loop exits before the first iteration after run_started."""
    sess = session_factory()
    repo = AgentRepository(sess)
    run = repo.create_run(
        goal="test",
        universe=["BTC/USDT"],
        date_start=date(2022, 1, 1),
        date_end=date(2022, 6, 30),
        starting_cash=10000.0,
        budget_usd=0.0,
        target_metric=None,
        target_value=None,
        model="claude-sonnet-4-6",
    )
    sess.commit()
    sess.refresh(run)
    run_id = run.id
    sess.close()

    def mock_llm(messages, model="x", max_tokens=2048):
        return "mock", 0.001

    from tests.fixtures.panels import single_asset_panel
    def mock_loader(symbols, start, end):
        return single_asset_panel([100.0, 110.0, 121.0, 133.1, 146.41, 161.05])

    queue: asyncio.Queue = asyncio.Queue()
    await run_agent_loop(
        run_id=run_id,
        goal="test",
        universe=["BTC/USDT"],
        date_start="2022-01-01",
        date_end="2022-06-30",
        starting_cash=10000.0,
        budget_usd=0.0,
        target_metric=None,
        target_value=None,
        model="claude-sonnet-4-6",
        call_llm=mock_llm,
        session_factory=session_factory,
        panel_loader=mock_loader,
        event_queue=queue,
    )

    events = []
    while not queue.empty():
        item = queue.get_nowait()
        if item is not None:
            events.append(item)

    types = [e["type"] for e in events]
    assert "run_started" in types
    assert "run_done" in types
    done_event = next(e for e in events if e["type"] == "run_done")
    assert done_event["status"] == "done"
```

- [x] **Step 4: Run runner tests**

```powershell
.venv\Scripts\pytest tests/agents/test_runner.py -v
```

Expected: 1 passed.

- [x] **Step 5: Commit**

```powershell
git add src/hedgefund/api/events.py src/hedgefund/agents/runner.py tests/agents/test_runner.py
git commit -m "feat(agents): add SSE event bus and async agent runner"
```

---

## Task 8: Agent Schemas + Routes + App Wiring

**Files:**
- Create: `src/hedgefund/api/agent_schemas.py`
- Create: `src/hedgefund/api/routes/agent_runs.py`
- Modify: `src/hedgefund/api/app.py`
- Create: `tests/api/test_agent_runs.py`

- [x] **Step 1: Create `agent_schemas.py`**

Create `src/hedgefund/api/agent_schemas.py`:

```python
from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class CreateAgentRunRequest(BaseModel):
    goal: str = Field(min_length=1)
    universe: list[str] = Field(min_length=1)
    date_start: date
    date_end: date
    starting_cash: float = Field(default=10_000.0, gt=0)
    budget_usd: float = Field(gt=0)
    target_metric: str | None = None
    target_value: float | None = None


class AgentRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    goal: str
    universe: list
    date_start: date
    date_end: date
    starting_cash: float
    budget_usd: float
    target_metric: str | None
    target_value: float | None
    model: str
    status: str
    cost_usd: float
    winner_backtest_id: uuid.UUID | None
    created_at: datetime
    finished_at: datetime | None


class AgentIterationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    run_id: uuid.UUID
    iteration_index: int
    research_note: str | None
    spec_json: dict | None
    backtest_id: uuid.UUID | None
    metrics_snapshot: dict | None
    critic_note: str | None
    failed: bool
    created_at: datetime


class AgentRunDetailResponse(AgentRunResponse):
    iterations: list[AgentIterationSummary] = []
```

- [x] **Step 2: Create `routes/agent_runs.py`**

Create `src/hedgefund/api/routes/agent_runs.py`:

```python
from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from hedgefund.agents import runner as agent_runner
from hedgefund.agents.llm import CallLLM
from hedgefund.api import events
from hedgefund.api.agent_schemas import (
    AgentIterationSummary,
    AgentRunDetailResponse,
    AgentRunResponse,
    CreateAgentRunRequest,
)
from hedgefund.api.db.agent_repository import AgentRepository
from hedgefund.api.db.engine import SessionLocal, get_session
from hedgefund.api.deps import get_call_llm, get_panel_loader

router = APIRouter(prefix="/agent-runs", tags=["agent-runs"])


@router.post("", response_model=AgentRunResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_agent_run(
    body: CreateAgentRunRequest,
    session: Session = Depends(get_session),
    call_llm: CallLLM = Depends(get_call_llm),
    panel_loader=Depends(get_panel_loader),
) -> AgentRunResponse:
    from hedgefund.api.config import get_settings

    repo = AgentRepository(session)
    run = repo.create_run(
        goal=body.goal,
        universe=body.universe,
        date_start=body.date_start,
        date_end=body.date_end,
        starting_cash=body.starting_cash,
        budget_usd=body.budget_usd,
        target_metric=body.target_metric,
        target_value=body.target_value,
        model=get_settings().anthropic_model,
    )
    session.commit()
    session.refresh(run)
    run_id = run.id

    queue = events.create_queue(run_id)

    asyncio.create_task(
        agent_runner.run_agent_loop(
            run_id=run_id,
            goal=body.goal,
            universe=body.universe,
            date_start=body.date_start.isoformat(),
            date_end=body.date_end.isoformat(),
            starting_cash=body.starting_cash,
            budget_usd=body.budget_usd,
            target_metric=body.target_metric,
            target_value=body.target_value,
            model=get_settings().anthropic_model,
            call_llm=call_llm,
            session_factory=SessionLocal,
            panel_loader=panel_loader,
            event_queue=queue,
        )
    )

    return AgentRunResponse.model_validate(run)


@router.get("", response_model=list[AgentRunResponse])
def list_agent_runs(session: Session = Depends(get_session)) -> list[AgentRunResponse]:
    repo = AgentRepository(session)
    return [AgentRunResponse.model_validate(r) for r in repo.list_runs()]


@router.get("/{run_id}", response_model=AgentRunDetailResponse)
def get_agent_run(
    run_id: uuid.UUID, session: Session = Depends(get_session)
) -> AgentRunDetailResponse:
    repo = AgentRepository(session)
    run = repo.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="agent run not found")
    iterations = repo.list_iterations(run_id)
    result = AgentRunDetailResponse.model_validate(run)
    result.iterations = [AgentIterationSummary.model_validate(it) for it in iterations]
    return result


@router.get("/{run_id}/events")
async def stream_agent_run_events(
    run_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> StreamingResponse:
    repo = AgentRepository(session)
    run = repo.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="agent run not found")

    # Capture persisted state before the generator runs (session lifetime ends after route returns)
    iterations_data = [
        {
            "iteration_index": it.iteration_index,
            "research_note": it.research_note,
            "spec_json": it.spec_json,
            "backtest_id": str(it.backtest_id) if it.backtest_id else None,
            "metrics": it.metrics_snapshot,
            "critic_note": it.critic_note,
            "failed": it.failed,
        }
        for it in repo.list_iterations(run_id)
    ]
    run_status = run.status
    cost_usd = run.cost_usd
    winner_id = str(run.winner_backtest_id) if run.winner_backtest_id else None

    async def generate():
        for data in iterations_data:
            payload = {"type": "iteration_complete", **data}
            yield f"event: iteration_complete\ndata: {json.dumps(payload)}\n\n"

        if run_status in ("done", "failed"):
            yield (
                f"event: run_done\n"
                f"data: {json.dumps({'type': 'run_done', 'status': run_status, 'cost_usd': cost_usd, 'winner_backtest_id': winner_id})}\n\n"
            )
            return

        queue = events.get_queue(run_id)
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

- [x] **Step 3: Update `app.py`**

Replace `src/hedgefund/api/app.py` completely:

```python
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hedgefund.api.routes.backtests import router as backtests_router
from hedgefund.api.routes.agent_runs import router as agent_runs_router


def create_app() -> FastAPI:
    app = FastAPI(title="HedgeFund Simulator API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(backtests_router)
    app.include_router(agent_runs_router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.on_event("startup")
    def _mark_stale_runs() -> None:
        from hedgefund.api.db.engine import SessionLocal
        from hedgefund.api.db.agent_repository import AgentRepository
        import logging
        session = SessionLocal()
        try:
            repo = AgentRepository(session)
            count = repo.mark_stale_runs_failed()
            session.commit()
            if count:
                logging.getLogger(__name__).warning(
                    "Marked %d stale agent run(s) as failed on startup.", count
                )
        finally:
            session.close()

    return app


app = create_app()
```

- [x] **Step 4: Write route tests**

Create `tests/api/test_agent_runs.py`:

```python
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from hedgefund.api.app import create_app
from hedgefund.api.db.engine import get_session
from hedgefund.api.db.models import Base
from hedgefund.api.db import agent_models as _  # noqa: F401
from hedgefund.api.deps import get_call_llm, get_panel_loader
from tests.fixtures.panels import single_asset_panel

import os
_TEST_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test",
)


@pytest.fixture(scope="session")
def ar_engine():
    eng = create_engine(_TEST_URL, future=True)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def ar_session(ar_engine):
    conn = ar_engine.connect()
    trans = conn.begin()
    Sess = sessionmaker(bind=conn, autoflush=False, expire_on_commit=False)
    sess = Sess()
    try:
        yield sess
    finally:
        sess.close()
        trans.rollback()
        conn.close()


@pytest.fixture
def ar_client(ar_session):
    app = create_app()

    def _override_session():
        yield ar_session

    def _override_loader():
        return lambda symbols, start, end: single_asset_panel(
            [100.0, 110.0, 121.0, 133.1, 146.41, 161.05]
        )

    def _override_llm():
        return lambda messages, model="x", max_tokens=2048: ("mock response", 0.001)

    app.dependency_overrides[get_session] = _override_session
    app.dependency_overrides[get_panel_loader] = _override_loader
    app.dependency_overrides[get_call_llm] = _override_llm
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


_BODY = {
    "goal": "maximize sharpe ratio",
    "universe": ["BTC/USDT"],
    "date_start": "2022-01-01",
    "date_end": "2022-06-30",
    "starting_cash": 10000,
    "budget_usd": 1.0,
    "target_metric": "sharpe",
    "target_value": 1.5,
}


def test_create_agent_run_returns_202(ar_client):
    res = ar_client.post("/agent-runs", json=_BODY)
    assert res.status_code == 202
    data = res.json()
    assert data["goal"] == "maximize sharpe ratio"
    assert data["status"] == "pending"
    assert "id" in data


def test_list_agent_runs(ar_client):
    ar_client.post("/agent-runs", json=_BODY)
    res = ar_client.get("/agent-runs")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_get_agent_run_not_found(ar_client):
    res = ar_client.get(f"/agent-runs/{uuid.uuid4()}")
    assert res.status_code == 404


def test_get_agent_run_by_id(ar_client):
    create_res = ar_client.post("/agent-runs", json=_BODY)
    run_id = create_res.json()["id"]
    res = ar_client.get(f"/agent-runs/{run_id}")
    assert res.status_code == 200
    assert res.json()["id"] == run_id
    assert "iterations" in res.json()
```

- [x] **Step 5: Run route tests**

```powershell
.venv\Scripts\pytest tests/api/test_agent_runs.py -v
```

Expected: 4 passed.

- [x] **Step 6: Commit**

```powershell
git add src/hedgefund/api/agent_schemas.py src/hedgefund/api/routes/agent_runs.py src/hedgefund/api/app.py tests/api/test_agent_runs.py
git commit -m "feat(agents): add agent_runs API routes + SSE streaming endpoint"
```

---

## Task 9: Dashboard Types + API Client

**Files:**
- Modify: `dashboard/src/types.ts`
- Create: `dashboard/src/api/agentRuns.ts`

- [x] **Step 1: Add agent types to `types.ts`**

Read `dashboard/src/types.ts` first, then append:

```typescript
export interface AgentRunSummary {
  id: string
  goal: string
  universe: string[]
  date_start: string
  date_end: string
  starting_cash: number
  budget_usd: number
  target_metric: string | null
  target_value: number | null
  model: string
  status: 'pending' | 'running' | 'done' | 'failed'
  cost_usd: number
  winner_backtest_id: string | null
  created_at: string
  finished_at: string | null
}

export interface AgentIteration {
  id: string
  run_id: string
  iteration_index: number
  research_note: string | null
  spec_json: Record<string, unknown> | null
  backtest_id: string | null
  metrics_snapshot: Record<string, number> | null
  critic_note: string | null
  failed: boolean
  created_at: string
}

export interface AgentRunDetail extends AgentRunSummary {
  iterations: AgentIteration[]
}

export interface CreateAgentRunRequest {
  goal: string
  universe: string[]
  date_start: string
  date_end: string
  starting_cash: number
  budget_usd: number
  target_metric: string | null
  target_value: number | null
}

export type SSEEvent =
  | { type: 'run_started'; run_id: string; goal: string; status: string }
  | {
      type: 'iteration_complete'
      iteration_index: number
      research_note: string | null
      spec_json: Record<string, unknown> | null
      backtest_id: string | null
      metrics: Record<string, number> | null
      critic_note: string | null
      failed: boolean
      cost_usd: number
    }
  | { type: 'run_done'; status: string; cost_usd: number; winner_backtest_id: string | null }
```

- [x] **Step 2: Create `agentRuns.ts`**

Create `dashboard/src/api/agentRuns.ts`:

```typescript
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from './client'
import type {
  AgentRunDetail,
  AgentRunSummary,
  CreateAgentRunRequest,
  SSEEvent,
} from '../types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export function listAgentRuns(): Promise<AgentRunSummary[]> {
  return apiFetch<AgentRunSummary[]>('/agent-runs')
}

export function getAgentRun(id: string): Promise<AgentRunDetail> {
  return apiFetch<AgentRunDetail>(`/agent-runs/${id}`)
}

export function createAgentRun(body: CreateAgentRunRequest): Promise<AgentRunSummary> {
  return apiFetch<AgentRunSummary>('/agent-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export type AgentRunEventsState = {
  events: SSEEvent[]
  connected: boolean
  done: boolean
}

export function useAgentRunEvents(runId: string | undefined): AgentRunEventsState {
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [done, setDone] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!runId) return
    const es = new EventSource(`${BASE_URL}/agent-runs/${runId}/events`)
    esRef.current = es
    setConnected(true)

    const handleEvent = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSEEvent
        setEvents((prev) => [...prev, data])
        if (data.type === 'run_done') {
          setDone(true)
          es.close()
        }
      } catch {
        // ignore malformed events
      }
    }

    es.addEventListener('run_started', handleEvent)
    es.addEventListener('iteration_complete', handleEvent)
    es.addEventListener('run_done', handleEvent)
    es.onerror = () => setConnected(false)

    return () => {
      es.close()
      setConnected(false)
    }
  }, [runId])

  return { events, connected, done }
}
```

- [x] **Step 3: Commit**

```powershell
git add dashboard/src/types.ts dashboard/src/api/agentRuns.ts
git commit -m "feat(dashboard): add agent run types and API client with SSE hook"
```

---

## Task 10: Agent UI Components

**Files:**
- Create: `dashboard/src/components/IterationCard.tsx`
- Create: `dashboard/src/components/IterationCard.test.tsx`
- Create: `dashboard/src/components/AgentRunCard.tsx`
- Create: `dashboard/src/components/AgentRunCard.test.tsx`
- Modify: `dashboard/src/styles/global.css`

- [x] **Step 1: Write failing component tests**

Create `dashboard/src/components/IterationCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { IterationCard } from './IterationCard'
import type { SSEEvent } from '../types'

const iterEvent = {
  type: 'iteration_complete' as const,
  iteration_index: 0,
  research_note: 'Use momentum strategy.',
  spec_json: null,
  backtest_id: 'abc-123',
  metrics: { sharpe: 1.2, total_return: 0.35, max_drawdown: -0.08 },
  critic_note: 'Good result!',
  failed: false,
  cost_usd: 0.05,
}

describe('IterationCard', () => {
  it('shows iteration number', () => {
    render(<MemoryRouter><IterationCard event={iterEvent} /></MemoryRouter>)
    expect(screen.getByText(/Iteration 1/i)).toBeInTheDocument()
  })

  it('shows research note', () => {
    render(<MemoryRouter><IterationCard event={iterEvent} /></MemoryRouter>)
    expect(screen.getByText(/momentum strategy/i)).toBeInTheDocument()
  })

  it('shows sharpe metric', () => {
    render(<MemoryRouter><IterationCard event={iterEvent} /></MemoryRouter>)
    expect(screen.getByText(/1\.20/)).toBeInTheDocument()
  })

  it('shows failed badge when failed', () => {
    render(
      <MemoryRouter>
        <IterationCard event={{ ...iterEvent, failed: true, backtest_id: null, metrics: null }} />
      </MemoryRouter>
    )
    expect(screen.getByText(/failed/i)).toBeInTheDocument()
  })
})
```

Create `dashboard/src/components/AgentRunCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AgentRunCard } from './AgentRunCard'
import type { AgentRunSummary } from '../types'

const run: AgentRunSummary = {
  id: 'run-1',
  goal: 'maximize sharpe',
  universe: ['BTC/USDT'],
  date_start: '2022-01-01',
  date_end: '2023-12-31',
  starting_cash: 10000,
  budget_usd: 1.0,
  target_metric: 'sharpe',
  target_value: 1.5,
  model: 'claude-sonnet-4-6',
  status: 'done',
  cost_usd: 0.42,
  winner_backtest_id: null,
  created_at: '2026-06-16T10:00:00Z',
  finished_at: '2026-06-16T10:05:00Z',
}

describe('AgentRunCard', () => {
  it('shows goal', () => {
    render(<MemoryRouter><AgentRunCard run={run} /></MemoryRouter>)
    expect(screen.getByText(/maximize sharpe/i)).toBeInTheDocument()
  })

  it('shows done status', () => {
    render(<MemoryRouter><AgentRunCard run={run} /></MemoryRouter>)
    expect(screen.getByText(/done/i)).toBeInTheDocument()
  })

  it('shows cost', () => {
    render(<MemoryRouter><AgentRunCard run={run} /></MemoryRouter>)
    expect(screen.getByText(/\$0\.42/)).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run tests — expect import failure**

```powershell
cd dashboard; npm run test -- --run 2>&1 | Select-Object -First 20
```

Expected: test files fail to resolve `IterationCard` and `AgentRunCard` imports.

- [x] **Step 3: Create `IterationCard.tsx`**

Create `dashboard/src/components/IterationCard.tsx`:

```tsx
import { Link } from 'react-router-dom'
import type { SSEEvent } from '../types'

type Props = {
  event: Extract<SSEEvent, { type: 'iteration_complete' }>
}

export function IterationCard({ event }: Props) {
  const { iteration_index, research_note, backtest_id, metrics, critic_note, failed } = event

  return (
    <div className="iteration-card">
      <div className="iteration-header">
        <span className="iteration-num">Iteration {iteration_index + 1}</span>
        {failed && <span className="badge-failed">failed</span>}
        {backtest_id && (
          <Link to={`/backtests/${backtest_id}`} className="iteration-link">
            View backtest →
          </Link>
        )}
      </div>

      {research_note && (
        <details className="iteration-section">
          <summary>Research note</summary>
          <p className="iteration-note">{research_note}</p>
        </details>
      )}

      {metrics && (
        <div className="iteration-metrics">
          {(['sharpe', 'total_return', 'max_drawdown'] as const)
            .filter((k) => k in metrics)
            .map((k) => (
              <span key={k} className={metrics[k] < 0 ? 'neg' : 'pos'}>
                {k}: {metrics[k].toFixed(2)}
              </span>
            ))}
        </div>
      )}

      {critic_note && (
        <details className="iteration-section">
          <summary>Critic</summary>
          <p className="iteration-note">{critic_note}</p>
        </details>
      )}
    </div>
  )
}
```

- [x] **Step 4: Create `AgentRunCard.tsx`**

Create `dashboard/src/components/AgentRunCard.tsx`:

```tsx
import { Link } from 'react-router-dom'
import type { AgentRunSummary } from '../types'

type Props = {
  run: AgentRunSummary
}

export function AgentRunCard({ run }: Props) {
  return (
    <Link to={`/research/runs/${run.id}`} className="agent-run-card">
      <div className="agent-run-goal">{run.goal}</div>
      <div className="agent-run-meta">
        <span className={`status-badge status-${run.status}`}>{run.status}</span>
        <span className="agent-run-cost">${run.cost_usd.toFixed(2)}</span>
      </div>
      <div className="agent-run-date">{new Date(run.created_at).toLocaleDateString()}</div>
    </Link>
  )
}
```

- [x] **Step 5: Add CSS to `global.css`**

Read `dashboard/src/styles/global.css` first, then append:

```css
/* Agent UI */
.iteration-card { background: var(--color-surface); border-radius: var(--radius); padding: var(--space-3); margin-bottom: var(--space-3); border-left: 3px solid var(--color-accent); }
.iteration-header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.iteration-num { font-weight: 600; }
.badge-failed { background: var(--color-neg, #e53e3e); color: #fff; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; }
.iteration-link { margin-left: auto; color: var(--color-accent); font-size: 0.85rem; }
.iteration-section { margin-top: var(--space-2); }
.iteration-section summary { cursor: pointer; color: var(--color-text-muted, #888); font-size: 0.85rem; }
.iteration-note { margin-top: var(--space-1); font-size: 0.85rem; white-space: pre-wrap; }
.iteration-metrics { display: flex; gap: var(--space-3); margin-top: var(--space-2); font-size: 0.85rem; }
.pos { color: var(--color-pos, #38a169); }
.neg { color: var(--color-neg, #e53e3e); }

.agent-run-card { display: block; background: var(--color-surface); border-radius: var(--radius); padding: var(--space-3); color: var(--color-text); text-decoration: none; }
.agent-run-card:hover { outline: 1px solid var(--color-accent); }
.agent-run-goal { font-weight: 600; margin-bottom: var(--space-1); }
.agent-run-meta { display: flex; align-items: center; gap: var(--space-2); }
.agent-run-cost { margin-left: auto; color: var(--color-text-muted, #888); font-size: 0.85rem; }
.agent-run-date { color: var(--color-text-muted, #888); font-size: 0.85rem; margin-top: var(--space-1); }
.status-badge { font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; border: 1px solid currentColor; }
.status-badge.status-running { color: #f0a500; }
.status-badge.status-done { color: var(--color-pos, #38a169); }
.status-badge.status-failed { color: var(--color-neg, #e53e3e); }

.agent-run-header { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-4); padding: var(--space-3); background: var(--color-surface); border-radius: var(--radius); }
.agent-run-header h2 { margin: 0; }
.agent-run-budget { color: var(--color-text-muted, #888); font-size: 0.85rem; }
.agent-form { display: flex; flex-direction: column; gap: var(--space-3); max-width: 600px; }
.agent-form label { display: flex; flex-direction: column; gap: var(--space-1); color: var(--color-text-muted, #888); }
.agent-form input, .agent-form select, .agent-form textarea { background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border, #333); border-radius: var(--radius); padding: var(--space-2); font: inherit; }
.agent-form textarea { min-height: 80px; resize: vertical; }
.agent-runs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3); }
@media (min-width: 900px) { .agent-runs-grid { grid-template-columns: repeat(3, 1fr); } }
```

- [x] **Step 6: Run component tests**

```powershell
cd dashboard; npm run test -- --run 2>&1 | Select-Object -Last 20
```

Expected: IterationCard (4 tests) and AgentRunCard (3 tests) pass.

- [x] **Step 7: Commit**

```powershell
git add dashboard/src/components/IterationCard.tsx dashboard/src/components/IterationCard.test.tsx dashboard/src/components/AgentRunCard.tsx dashboard/src/components/AgentRunCard.test.tsx dashboard/src/styles/global.css
git commit -m "feat(dashboard): add IterationCard and AgentRunCard components"
```

---

## Task 11: Agent Pages

**Files:**
- Create: `dashboard/src/pages/AgentRunPage.tsx`
- Create: `dashboard/src/pages/AgentRunPage.test.tsx`
- Create: `dashboard/src/pages/AgentResultPage.tsx`
- Create: `dashboard/src/pages/AgentResultPage.test.tsx`
- Create: `dashboard/src/pages/AgentHistoryPage.tsx`
- Create: `dashboard/src/pages/AgentHistoryPage.test.tsx`
- Modify: `dashboard/src/App.tsx`
- Modify: `dashboard/src/components/NavBar.tsx`

- [x] **Step 1: Create `AgentRunPage.tsx`**

Create `dashboard/src/pages/AgentRunPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SYMBOLS } from '../constants'
import { createAgentRun } from '../api/agentRuns'
import type { CreateAgentRunRequest } from '../types'

const METRIC_OPTIONS = ['sharpe', 'total_return', 'max_drawdown']

export function AgentRunPage() {
  const navigate = useNavigate()
  const [goal, setGoal] = useState('')
  const [universe, setUniverse] = useState<string[]>(['BTC/USDT'])
  const [dateStart, setDateStart] = useState('2022-01-01')
  const [dateEnd, setDateEnd] = useState('2023-12-31')
  const [startingCash, setStartingCash] = useState(10000)
  const [budgetUsd, setBudgetUsd] = useState(1.0)
  const [targetMetric, setTargetMetric] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSymbol(sym: string) {
    setUniverse((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!goal.trim()) return
    setPending(true)
    setError(null)
    const body: CreateAgentRunRequest = {
      goal,
      universe,
      date_start: dateStart,
      date_end: dateEnd,
      starting_cash: startingCash,
      budget_usd: budgetUsd,
      target_metric: targetMetric || null,
      target_value: targetValue ? Number(targetValue) : null,
    }
    try {
      const run = await createAgentRun(body)
      navigate(`/research/runs/${run.id}`)
    } catch (err) {
      setError((err as Error).message)
      setPending(false)
    }
  }

  return (
    <div>
      <h2>New Research Run</h2>
      {error && <p className="neg" role="alert">{error}</p>}
      <form className="agent-form" onSubmit={handleSubmit}>
        <label>
          Goal
          <textarea
            aria-label="Goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Maximize Sharpe ratio on BTC momentum strategies"
            required
          />
        </label>

        <fieldset>
          <legend>Universe</legend>
          <div className="symbol-grid">
            {SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                className={universe.includes(sym) ? 'primary' : ''}
                onClick={() => toggleSymbol(sym)}
              >
                {sym}
              </button>
            ))}
          </div>
        </fieldset>

        <label>
          Start date
          <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
        </label>
        <label>
          End date
          <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
        </label>
        <label>
          Starting cash ($)
          <input
            type="number"
            value={startingCash}
            onChange={(e) => setStartingCash(Number(e.target.value))}
          />
        </label>
        <label>
          Budget (USD)
          <input
            type="number"
            step="0.01"
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(Number(e.target.value))}
          />
        </label>
        <label>
          Target metric (optional)
          <select value={targetMetric} onChange={(e) => setTargetMetric(e.target.value)}>
            <option value="">— none —</option>
            {METRIC_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        {targetMetric && (
          <label>
            Target value
            <input
              type="number"
              step="0.01"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
          </label>
        )}
        <button
          type="submit"
          className="primary"
          disabled={pending || !goal.trim() || universe.length === 0}
        >
          {pending ? 'Launching…' : 'Launch'}
        </button>
      </form>
    </div>
  )
}
```

- [x] **Step 2: Create `AgentResultPage.tsx`**

Create `dashboard/src/pages/AgentResultPage.tsx`:

```tsx
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAgentRun, useAgentRunEvents } from '../api/agentRuns'
import { IterationCard } from '../components/IterationCard'
import type { SSEEvent } from '../types'

export function AgentResultPage() {
  const { id } = useParams<{ id: string }>()

  const { data: run } = useQuery({
    queryKey: ['agent-runs', id],
    queryFn: () => getAgentRun(id!),
    enabled: !!id,
  })

  const { events, connected, done } = useAgentRunEvents(id)

  const iterEvents = events.filter(
    (e): e is Extract<SSEEvent, { type: 'iteration_complete' }> =>
      e.type === 'iteration_complete'
  )

  const runDone = events.find((e) => e.type === 'run_done') as
    | Extract<SSEEvent, { type: 'run_done' }>
    | undefined

  return (
    <div>
      <div className="agent-run-header">
        <h2>{run?.goal ?? 'Research Run'}</h2>
        <div className="agent-run-budget">
          ${run?.cost_usd?.toFixed(3) ?? '0.000'} / ${run?.budget_usd?.toFixed(2) ?? '?'}
          {!done && connected && <span> · streaming…</span>}
          {done && runDone && <span> · {runDone.status}</span>}
        </div>
      </div>

      {iterEvents.length === 0 && !done && <p>Waiting for first iteration…</p>}

      {iterEvents.map((ev) => (
        <IterationCard key={ev.iteration_index} event={ev} />
      ))}

      {runDone?.winner_backtest_id && (
        <p className="pos">
          Best run:{' '}
          <a href={`/backtests/${runDone.winner_backtest_id}`}>view result →</a>
        </p>
      )}
    </div>
  )
}
```

- [x] **Step 3: Create `AgentHistoryPage.tsx`**

Create `dashboard/src/pages/AgentHistoryPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { listAgentRuns } from '../api/agentRuns'
import { AgentRunCard } from '../components/AgentRunCard'

export function AgentHistoryPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['agent-runs'],
    queryFn: listAgentRuns,
  })

  if (isLoading) return <p>Loading…</p>
  if (isError) return <p className="neg">{(error as Error).message}</p>

  const runs = data ?? []
  if (runs.length === 0) {
    return <p>No research runs yet — go to Research to get started.</p>
  }

  return (
    <div>
      <h2>Research History</h2>
      <div className="agent-runs-grid">
        {runs.map((run) => (
          <AgentRunCard key={run.id} run={run} />
        ))}
      </div>
    </div>
  )
}
```

- [x] **Step 4: Write page tests**

Create `dashboard/src/pages/AgentRunPage.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AgentRunPage } from './AgentRunPage'

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AgentRunPage', () => {
  it('renders the form', () => {
    wrap(<AgentRunPage />)
    expect(screen.getByRole('heading', { name: /new research run/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /launch/i })).toBeInTheDocument()
  })

  it('launch button disabled when goal is empty', () => {
    wrap(<AgentRunPage />)
    expect(screen.getByRole('button', { name: /launch/i })).toBeDisabled()
  })
})
```

Create `dashboard/src/pages/AgentResultPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AgentResultPage } from './AgentResultPage'

vi.mock('../api/agentRuns', () => ({
  getAgentRun: vi.fn().mockResolvedValue({
    id: 'run-1',
    goal: 'maximize sharpe',
    universe: ['BTC/USDT'],
    date_start: '2022-01-01',
    date_end: '2023-12-31',
    starting_cash: 10000,
    budget_usd: 1.0,
    target_metric: null,
    target_value: null,
    model: 'claude-sonnet-4-6',
    status: 'done',
    cost_usd: 0.42,
    winner_backtest_id: null,
    created_at: '2026-06-16T10:00:00Z',
    finished_at: null,
    iterations: [],
  }),
  useAgentRunEvents: vi.fn().mockReturnValue({ events: [], connected: false, done: false }),
}))

describe('AgentResultPage', () => {
  it('renders run goal from query', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/research/runs/run-1']}>
          <Routes>
            <Route path="/research/runs/:id" element={<AgentResultPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(await screen.findByText(/maximize sharpe/i)).toBeInTheDocument()
  })
})
```

Create `dashboard/src/pages/AgentHistoryPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AgentHistoryPage } from './AgentHistoryPage'

vi.mock('../api/agentRuns', () => ({
  listAgentRuns: vi.fn().mockResolvedValue([]),
}))

describe('AgentHistoryPage', () => {
  it('shows empty state', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><AgentHistoryPage /></MemoryRouter>
      </QueryClientProvider>
    )
    expect(await screen.findByText(/no research runs yet/i)).toBeInTheDocument()
  })
})
```

- [x] **Step 5: Run page tests**

```powershell
cd dashboard; npm run test -- --run 2>&1 | Select-Object -Last 20
```

Expected: AgentRunPage (2), AgentResultPage (1), AgentHistoryPage (1) pass.

- [x] **Step 6: Wire `App.tsx`**

Read `dashboard/src/App.tsx` first, then replace with:

```tsx
import { Routes, Route } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { NewRunPage } from './pages/NewRunPage'
import { HistoryPage } from './pages/HistoryPage'
import { ResultPage } from './pages/ResultPage'
import { AgentRunPage } from './pages/AgentRunPage'
import { AgentResultPage } from './pages/AgentResultPage'
import { AgentHistoryPage } from './pages/AgentHistoryPage'

export default function App() {
  return (
    <>
      <NavBar />
      <main className="container">
        <Routes>
          <Route path="/" element={<NewRunPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/backtests/:id" element={<ResultPage />} />
          <Route path="/research" element={<AgentRunPage />} />
          <Route path="/research/runs/:id" element={<AgentResultPage />} />
          <Route path="/research/history" element={<AgentHistoryPage />} />
        </Routes>
      </main>
    </>
  )
}
```

- [x] **Step 7: Wire `NavBar.tsx`**

Read `dashboard/src/components/NavBar.tsx` first, then replace with:

```tsx
import { NavLink } from 'react-router-dom'

export function NavBar() {
  return (
    <nav className="navbar">
      <span className="brand">HedgeFund Sim</span>
      <NavLink to="/" end>New Run</NavLink>
      <NavLink to="/history">History</NavLink>
      <NavLink to="/research">Research</NavLink>
      <NavLink to="/research/history">Research History</NavLink>
    </nav>
  )
}
```

- [x] **Step 8: TypeScript check**

```powershell
cd dashboard; npx tsc --noEmit
```

Expected: no errors. If there are errors, fix them before proceeding.

- [x] **Step 9: Commit**

```powershell
git add dashboard/src/pages/ dashboard/src/App.tsx dashboard/src/components/NavBar.tsx
git commit -m "feat(dashboard): add Research pages, wired into App and NavBar"
```

---

## Task 12: Full Test Suite + Build

- [x] **Step 1: Run full Python test suite**

```powershell
.venv\Scripts\pytest tests/ -q
```

Expected: all tests pass. Fix any failures before continuing.

- [x] **Step 2: Run full dashboard test suite**

```powershell
cd dashboard; npm run test -- --run
```

Expected: all tests pass.

- [x] **Step 3: Build dashboard**

```powershell
cd dashboard; npm run build
```

Expected: build succeeds with no errors.

- [x] **Step 4: Final commit**

```powershell
git add -A
git commit -m "feat(surface-c): complete LangGraph agent UI — research loop, SSE streaming, React pages"
```
