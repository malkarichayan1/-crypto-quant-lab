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
            prose = text[: match.start()].strip()
            note = f"{prose} {reason}".strip() if reason else (prose or text)
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
