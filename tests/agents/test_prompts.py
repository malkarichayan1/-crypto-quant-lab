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
