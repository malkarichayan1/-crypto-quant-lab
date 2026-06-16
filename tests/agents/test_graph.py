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
