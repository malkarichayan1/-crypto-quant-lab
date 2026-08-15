from __future__ import annotations

from collections.abc import Callable
from datetime import date
from functools import lru_cache

from fastapi import Header, HTTPException

from hedgefund.agents.llm import CallLLM, call_llm as _call_llm
from hedgefund.data.panel import PricePanel, load_panel
from hedgefund.data.universe import KRAKEN_LIVE_UNIVERSE
from hedgefund.manual.market_data import MarketDataCache
from hedgefund.manual.news import NewsCache

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


def get_device_id(x_device_id: str | None = Header(default=None, alias="X-Device-Id")) -> str:
    """Required per-request device identity for the manual-trading surfaces
    (watchlist/portfolio/advice). The frontend generates and persists a
    random UUID in localStorage (dashboard/src/lib/deviceId.ts) and sends it
    on every request — this keeps each visitor's simulated portfolio
    private without requiring login. Not a security credential: anyone who
    guesses another device's ID could act as that device. That's an
    accepted tradeoff for a login-free play-money simulator, not a defect.
    """
    if not x_device_id:
        raise HTTPException(status_code=400, detail="X-Device-Id header is required.")
    return x_device_id


@lru_cache
def get_market_data() -> MarketDataCache:
    """Singleton MarketDataCache over a real ccxt Kraken instance.

    Kraken, not Binance: Binance blocks requests from Render's hosting IP
    range (confirmed via repeated 503s from the deployed backend), so live
    quotes are served from Kraken with KRAKEN_LIVE_UNIVERSE — 15 of
    DEFAULT_UNIVERSE's 20 pairs (Kraken lacks XLM/ETC/TRX/EOS/AAVE as
    *_USDT). Backtesting is unaffected: it reads historical parquet panels
    via get_panel_loader(), not this live ccxt path.

    lru_cache (rather than a hand-rolled `global`/`if None` check) makes the
    first-call construction thread-safe: FastAPI dispatches sync dependency
    callables to a worker thread pool, so two concurrent first requests could
    otherwise both pass the None-check and build two separate exchanges/caches.

    Overridden in tests via app.dependency_overrides.
    """
    import ccxt  # local import: only needed when serving live market data

    return MarketDataCache(exchange=ccxt.kraken(), universe=KRAKEN_LIVE_UNIVERSE)


@lru_cache
def get_news_cache() -> NewsCache:
    """Singleton NewsCache over the default free RSS feeds.

    lru_cache for the same reason as get_market_data: FastAPI dispatches sync
    dependency callables to a worker thread pool, so two concurrent first
    requests could otherwise build two caches and double the outbound fetches.

    Overridden in tests via app.dependency_overrides.
    """
    return NewsCache()
