from __future__ import annotations

from collections.abc import Callable
from datetime import date

from hedgefund.agents.llm import CallLLM, call_llm as _call_llm
from hedgefund.data.panel import PricePanel, load_panel

PanelLoader = Callable[[list[str], date, date], PricePanel]


def get_panel_loader() -> PanelLoader:
    """Default panel loader reading the parquet cache.

    Overridden in tests via app.dependency_overrides to return a synthetic panel.
    """

    def _load(symbols: list[str], start: date, end: date) -> PricePanel:
        return load_panel(symbols, start, end)

    return _load


def get_call_llm() -> CallLLM:
    """FastAPI dependency returning the Anthropic LLM caller.

    Override in tests via app.dependency_overrides[get_call_llm].
    """
    return _call_llm
