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
