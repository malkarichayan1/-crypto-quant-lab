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
