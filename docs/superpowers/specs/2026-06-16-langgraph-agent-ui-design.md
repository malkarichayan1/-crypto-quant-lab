# Surface C: LangGraph Agent UI — Design Spec

**Date:** 2026-06-16
**Project:** AI Crypto Hedge Fund Simulator
**Slice:** 3 of 4 (surface C — autonomous agent loop + live UI)

---

## 1. Purpose

Add an autonomous agent loop that generates and refines trading strategies without
manual intervention. The user provides a goal (natural-language description of the
desired outcome), a universe, date range, budget (max dollars of LLM spend), and
an optional target metric/value. Three LLM agents — Research, Quant, Critic — run
in a LangGraph cycle, each iteration producing a backtest. The loop terminates when
the target is met or the budget is exhausted. A live iteration-timeline page streams
progress to the browser as each step completes.

### Success criteria

- `POST /agent-runs` launches the autonomous loop as a background task and returns
  a run record immediately (202 Accepted).
- `GET /agent-runs/{id}/events` (SSE) streams iteration progress live; reload
  replays persisted state then reattaches.
- `GET /agent-runs` lists past runs; `GET /agent-runs/{id}` returns full run with
  all iterations.
- Each iteration's backtest is a normal row in the existing `backtests` table,
  viewable on the existing Result page.
- The React UI has a "Research" section: agent form, live run page, and history.
- All LLM calls mocked in tests; agent loop unit-testable without real API calls.
- 80%+ coverage on `hedgefund/agents/` and new route/schema code.

---

## 2. Scope

### In scope

- LangGraph cyclic graph: Research → Quant → Critic → (terminate or loop).
- Three prompt roles: Research (strategy ideation), Quant (spec generation),
  Critic (metric evaluation and direction for next iteration).
- Persistence: two new tables (`agent_runs`, `agent_iterations`).
- Streaming: SSE endpoint backed by per-run in-memory asyncio queue; replay from
  DB on reconnect.
- React pages: agent form, live iteration-timeline, agent run history.
- Budget tracking: accumulate token cost per iteration; stop when exhausted.
- Anthropic SDK (`claude-sonnet-4-6`) with `ANTHROPIC_API_KEY` env var.

### Explicitly out of scope

- Web search, external data, news feeds — agents work from goal + DSL + prior
  results only.
- Multi-user / authentication.
- Parallel runs — one run at a time is enough for a local research tool.
- Pause / resume — a run either runs to completion or is killed.
- Editing a run's parameters mid-flight.

---

## 3. Architecture

### Backend: new package `src/hedgefund/agents/`

```
src/hedgefund/
  agents/
    __init__.py
    prompts.py          # system prompts for Research, Quant, Critic
    llm.py              # thin Anthropic SDK wrapper (injectable)
    graph.py            # LangGraph cyclic graph definition + state
    runner.py           # orchestrate a run: loop driver, budget accounting, event emission
  api/
    db/
      agent_models.py   # AgentRunRow, AgentIterationRow ORM models
      agent_repository.py  # AgentRepository
    agent_schemas.py    # Pydantic request/response for agent routes
    routes/
      agent_runs.py     # /agent-runs routes + SSE endpoint
    events.py           # in-memory SSE event bus (per-run asyncio.Queue)
migrations/
  versions/
    <hash>_add_agent_tables.py
```

The existing `backtests` routes, models, and repository are **untouched**. Agent
iterations create backtest rows by calling the existing `BacktestRepository.create()`
directly — no new storage path for backtest data.

### LangGraph graph

```
START → research_node → quant_node → backtest_node → critic_node → END
                ↑___________________________________|
```

State (`AgentState` TypedDict) carries:
- `goal`, `universe`, `start`, `end`, `starting_cash` — immutable, from user input
- `iteration` — int, increments each cycle
- `research_note` — str, Research agent output
- `spec` — dict or None, Quant agent output (validated StrategySpec)
- `backtest_id` — UUID or None, written after engine run
- `metrics` — dict or None, written after engine run
- `critic_note` — str, Critic output
- `quant_retry` — int, resets to 0 each iteration, caps at 3
- `done` — bool, set True by Critic or budget guard

**Nodes:**
- `research_node` — calls LLM with goal + DSL summary + all prior iterations'
  critic notes + metrics. Returns updated `research_note`.
- `quant_node` — calls LLM with research note + DSL spec schema. Parses JSON into
  `StrategySpec`. On `SpecValidationError`, increments `quant_retry` and re-enters
  `quant_node` (up to 3 times, feeding error back). After 3 failures, sets
  `spec=None` and advances to `critic_node` with `done=False`.
- `backtest_node` — pure Python: calls `run_backtest()` + `summarize()` +
  `BacktestRepository.create()`. No LLM. Emits `iteration_backtest` SSE event.
  Skipped if `spec is None`.
- `critic_node` — calls LLM with metrics + target + budget remaining + all prior
  critic notes. Returns `critic_note` and `done` flag.

**Conditional edge after `critic_node`:** if `done` → END else → `research_node`.

**Termination conditions (checked in critic_node prompt):**
1. Target metric reached (e.g. `sharpe >= 1.5`).
2. Budget exhausted (accumulated cost >= `budget_usd`).
3. Hard cap: 20 iterations.

### Streaming (SSE)

- `runner.run_agent_loop()` is an async function launched via `asyncio.create_task`
  inside a FastAPI startup or route background task.
- Each state transition emits a JSON event to an `asyncio.Queue` stored in a
  module-level dict `_queues: dict[UUID, asyncio.Queue]` in `events.py`.
- `GET /agent-runs/{id}/events` is an async generator that:
  1. Queries DB for all existing `AgentIterationRow` records and replays them as
     synthetic events (for reconnect).
  2. Then reads from the live queue until a sentinel (`None`) is received.
- Queue is cleaned up by the runner after posting the sentinel.
- No Redis — local single-user tool only.

### Frontend additions

```
dashboard/src/
  api/
    agentRuns.ts          # fetch functions + useAgentRunEvents SSE hook
  pages/
    AgentRunPage.tsx      # agent form → POST → navigate to live result
    AgentResultPage.tsx   # SSE iteration-timeline (live + replay)
    AgentHistoryPage.tsx  # list of past runs
  components/
    IterationCard.tsx     # one iteration: research note, metrics, critic note
    AgentRunCard.tsx      # summary card for history list
```

Modified:
- `App.tsx` — add `/research`, `/research/runs/:id`, `/research/history` routes.
- `NavBar.tsx` — add "Research" link.
- `global.css` — agent UI styles.

**AgentResultPage layout:**
- Header: goal text, status badge (running / done / failed), cost_usd / budget_usd.
- Vertical list of `IterationCard`s, appended in real time via SSE.
- Each card: iteration number + Research note (collapsible) + metrics table (links
  to `/backtests/:id`) + Critic note.

---

## 4. Data Model

### `agent_runs` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` PK | `uuid4()` server-side |
| `goal` | `TEXT NOT NULL` | user goal string |
| `universe` | `JSONB NOT NULL` | `["BTC/USDT", "ETH/USDT"]` |
| `date_start` | `DATE NOT NULL` | |
| `date_end` | `DATE NOT NULL` | |
| `starting_cash` | `DOUBLE PRECISION NOT NULL` | |
| `budget_usd` | `DOUBLE PRECISION NOT NULL` | max LLM spend |
| `target_metric` | `TEXT` | nullable, e.g. `"sharpe"` |
| `target_value` | `DOUBLE PRECISION` | nullable |
| `model` | `TEXT NOT NULL` | `"claude-sonnet-4-6"` |
| `status` | `TEXT NOT NULL` | `pending|running|done|failed` |
| `cost_usd` | `DOUBLE PRECISION NOT NULL DEFAULT 0` | accumulated token cost |
| `winner_backtest_id` | `UUID FK→backtests.id` | nullable |
| `created_at` | `TIMESTAMPTZ NOT NULL` | server default |
| `finished_at` | `TIMESTAMPTZ` | nullable |

### `agent_iterations` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` PK | `uuid4()` server-side |
| `run_id` | `UUID FK→agent_runs.id NOT NULL` | parent run |
| `iteration_index` | `INTEGER NOT NULL` | 0-based |
| `research_note` | `TEXT` | nullable |
| `spec_json` | `JSONB` | nullable |
| `backtest_id` | `UUID FK→backtests.id` | nullable |
| `metrics_snapshot` | `JSONB` | nullable, copy of metrics at run time |
| `critic_note` | `TEXT` | nullable |
| `failed` | `BOOLEAN NOT NULL DEFAULT FALSE` | quant gave up after 3 retries |
| `created_at` | `TIMESTAMPTZ NOT NULL` | server default |

---

## 5. API Surface

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/agent-runs` | `CreateAgentRunRequest` | `AgentRunResponse` 202 |
| `GET` | `/agent-runs` | — | `list[AgentRunSummary]` 200 |
| `GET` | `/agent-runs/{id}` | — | `AgentRunDetailResponse` 200/404 |
| `GET` | `/agent-runs/{id}/events` | — | SSE stream 200/404 |

**`CreateAgentRunRequest` fields:**
- `goal: str`
- `universe: list[str]`
- `date_start: date`
- `date_end: date`
- `starting_cash: float = 10_000.0`
- `budget_usd: float`
- `target_metric: str | None`
- `target_value: float | None`

**SSE event types** (JSON in `data:` field, prefixed `event: <type>\n`):
- `run_started` — `{"run_id": "...", "goal": "...", "status": "running"}`
- `iteration_research` — `{"iteration_index": 0, "research_note": "..."}`
- `iteration_spec` — `{"iteration_index": 0, "spec_json": {...}}` or `{"iteration_index": 0, "failed": true}`
- `iteration_backtest` — `{"iteration_index": 0, "backtest_id": "...", "metrics": {...}}`
- `iteration_critic` — `{"iteration_index": 0, "critic_note": "...", "done": false}`
- `run_done` — `{"status": "done", "cost_usd": 0.42, "winner_backtest_id": "..."}`

---

## 6. Prompts

### Research agent system prompt

Includes: goal text, DSL capabilities summary (available indicator types, selection
modes, sizing schemes, valid date ranges), summary of all prior iterations (index,
key metrics, critic note). Instructs to return a markdown research note with:
hypothesis, proposed indicator(s), selection mode, sizing scheme, and expected
edge.

### Quant agent system prompt

Includes: research note, full JSON schema of `StrategySpec` with field
descriptions and constraints, the specific `universe`, `date_start`, `date_end`.
Instructs to return **only** a JSON object matching the schema — no prose. On
retry, also includes the prior attempt's JSON and the validation error message.

### Critic agent system prompt

Includes: iteration metrics dict, target metric + value (or "no target"), budget
remaining in USD, all prior critic notes. Instructs to return a critique paragraph
followed by `{"done": true/false, "reason": "..."}` as the final line.

---

## 7. Budget Accounting

Token costs for `claude-sonnet-4-6`:
- Input: $3.00 / 1M tokens
- Output: $15.00 / 1M tokens

`llm.py` reads `usage.input_tokens` and `usage.output_tokens` from each response,
computes cost, and returns `(content_text, cost_usd)`. The runner accumulates cost
and updates `AgentRunRow.cost_usd` after each LLM call. If `cost_usd >= budget_usd`
before a new iteration starts, the loop terminates with `status="done"` and reason
"budget exhausted".

---

## 8. Testing

- **`tests/agents/test_prompts.py`** — prompt builders return strings containing
  required keywords; asserts goal, metric names, prior notes appear correctly.
  No LLM calls.
- **`tests/agents/test_graph.py`** — full graph run with `call_llm` and
  `run_backtest` mocked. Covers: happy path (2 iterations, target met on second),
  quant retry (3 failures → `failed=True`, loop advances), budget termination
  (budget_usd=0.0 → terminates after first iteration).
- **`tests/api/test_agent_runs.py`** — FastAPI TestClient; graph runner mocked.
  Covers: `POST` returns 202 + run record, `GET` list, `GET` by id, 404 paths.
- **`tests/api/test_agent_sse.py`** — SSE replay: push synthetic events to queue,
  assert they appear in response stream. Reconnect: assert DB-persisted events are
  replayed before live queue.
- **Dashboard:** `IterationCard.test.tsx`, `AgentRunCard.test.tsx`,
  `AgentHistoryPage.test.tsx` (mocked TanStack Query). `AgentResultPage.test.tsx`
  with mocked `useAgentRunEvents` hook.

Coverage target: 80%+ on `hedgefund/agents/` and `hedgefund/api/routes/agent_runs.py`.

---

## 9. Dependencies Added

**Python (add to `pyproject.toml`):**
- `anthropic>=0.30`
- `langgraph>=0.2`

**Dashboard:** no new npm packages — SSE via native `EventSource` API.

---

## 10. Configuration

- `ANTHROPIC_API_KEY` — required; `app.py` raises `RuntimeError` at startup if missing.
- `ANTHROPIC_MODEL` — optional; defaults to `"claude-sonnet-4-6"`.

Add both to `.env.example`.

---

## 11. Risks + Mitigations

- **SSE queue leak.** Runner posts sentinel `None` on completion/failure; route
  removes the queue entry. Stale runs on server restart are acceptable — local tool.
- **Stale `running` status on restart.** On `app` startup, query for `running`
  runs and mark them `failed`. One startup hook in `app.py`.
- **LangGraph API churn.** Pin `langgraph` to `>=0.2,<0.3` in `pyproject.toml`.
- **Quant infinite retry.** Hard cap 3 retries per iteration, then `failed=True`,
  advance to next iteration.
- **Long runs block budget.** Budget check happens at the start of each iteration
  (before LLM calls), so overage is bounded to one iteration's cost.
