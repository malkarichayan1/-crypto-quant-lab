from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from hedgefund.manual.market_data import MarketDataProvider, PricesUnavailableError
from hedgefund.manual.portfolio_service import get_portfolio_view

logger = logging.getLogger(__name__)


def snapshot_once(repo, market: MarketDataProvider) -> float | None:
    """Record one equity point for the active portfolio. Never creates a
    portfolio; skips quietly when prices are down (next cycle retries)."""
    if repo.get_active_portfolio() is None:
        return None
    try:
        view = get_portfolio_view(repo, market)
    except PricesUnavailableError:
        logger.warning("equity snapshot skipped: prices unavailable")
        return None
    repo.add_equity_point(view.portfolio_id, datetime.now(timezone.utc), view.equity)
    return view.equity


async def equity_snapshot_loop(
    session_factory, market: MarketDataProvider, interval_seconds: int
) -> None:
    """Background loop mirroring paper.ticker_loop: sync DB + ccxt work runs in
    a worker thread; the loop never dies."""
    from hedgefund.api.db.manual_repository import ManualRepository

    while True:
        def _cycle() -> None:
            db = session_factory()
            try:
                snapshot_once(ManualRepository(db), market)
                db.commit()
            finally:
                db.close()

        try:
            await asyncio.to_thread(_cycle)
        except Exception:  # noqa: BLE001 - never let the loop die
            logger.exception("equity snapshot cycle crashed; continuing")
        await asyncio.sleep(interval_seconds)
