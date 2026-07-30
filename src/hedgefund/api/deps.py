from __future__ import annotations

from collections.abc import Callable
from datetime import date
from functools import lru_cache

from hedgefund.agents.llm import CallLLM, call_llm as _call_llm
from hedgefund.data.panel import PricePanel, load_panel
from hedgefund.manual.market_data import MarketDataCache

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


@lru_cache
def get_market_data() -> MarketDataCache:
    """Singleton MarketDataCache over a real ccxt binance instance.

    lru_cache (rather than a hand-rolled `global`/`if None` check) makes the
    first-call construction thread-safe: FastAPI dispatches sync dependency
    callables to a worker thread pool, so two concurrent first requests could
    otherwise both pass the None-check and build two separate exchanges/caches.

    Overridden in tests via app.dependency_overrides.
    """
    import ccxt  # local import: only needed when serving live market data

    return MarketDataCache(exchange=ccxt.binance())
