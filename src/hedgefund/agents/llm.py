from __future__ import annotations

from collections.abc import Callable

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
    # Local import: the anthropic SDK costs ~1s to import, and this module is
    # pulled in transitively by api.deps and routes.agent_runs — so a
    # module-scope import put that second on every cold start, including the
    # majority of requests (market data, portfolio, health) that never call an
    # LLM. Deferring it here moves that cost onto the advice/agent-run paths
    # that actually need it. CallLLM above stays a plain Callable alias, so
    # nothing that annotates against it needs the SDK loaded.
    import anthropic

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
