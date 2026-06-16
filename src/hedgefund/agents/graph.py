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
