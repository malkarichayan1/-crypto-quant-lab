from __future__ import annotations

import asyncio
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hedgefund.api.routes.backtests import router as backtests_router
from hedgefund.api.routes.agent_runs import router as agent_runs_router
from hedgefund.api.routes.paper_sessions import router as paper_sessions_router
from hedgefund.api.routes.market import router as market_router
from hedgefund.api.routes.manual_portfolio import router as manual_portfolio_router
from hedgefund.api.routes.watchlist import router as watchlist_router
from hedgefund.api.routes.advice import router as advice_router


def create_app() -> FastAPI:
    from hedgefund.api.config import get_settings

    app = FastAPI(title="HedgeFund Simulator API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(backtests_router)
    app.include_router(agent_runs_router)
    app.include_router(paper_sessions_router)
    app.include_router(market_router)
    app.include_router(manual_portfolio_router)
    app.include_router(watchlist_router)
    app.include_router(advice_router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.on_event("startup")
    async def _start_paper_ticker() -> None:
        if os.environ.get("PAPER_TICKER_ENABLED", "1") != "1":
            return
        from hedgefund.api import events
        from hedgefund.api.config import get_settings
        from hedgefund.api.db.engine import SessionLocal
        from hedgefund.api.paper_panel import get_paper_panel_loader
        from hedgefund.paper import ticker as paper_ticker

        settings = get_settings()
        loader = get_paper_panel_loader()

        def publish_for(session_id):
            events.create_queue(session_id)

            def _publish(ev: dict) -> None:
                q = events.get_queue(session_id)
                if q is not None:
                    q.put_nowait(ev)

            return _publish

        asyncio.create_task(
            paper_ticker.ticker_loop(
                session_factory=SessionLocal,
                panel_loader=loader,
                publish_for=publish_for,
                interval_seconds=settings.paper_tick_interval_seconds,
                lookback_bars=settings.paper_fetch_lookback_bars,
            )
        )

    @app.on_event("startup")
    async def _start_equity_snapshots() -> None:
        if os.environ.get("MANUAL_EQUITY_SNAPSHOTS_ENABLED", "1") != "1":
            return
        from hedgefund.api.config import get_settings
        from hedgefund.api.db.engine import SessionLocal
        from hedgefund.api.deps import get_market_data
        from hedgefund.manual.equity_snapshots import equity_snapshot_loop

        asyncio.create_task(
            equity_snapshot_loop(
                SessionLocal,
                get_market_data(),
                interval_seconds=get_settings().manual_equity_snapshot_seconds,
            )
        )

    @app.on_event("startup")
    def _mark_stale_runs() -> None:
        import logging
        from hedgefund.api.db.engine import SessionLocal
        from hedgefund.api.db.agent_repository import AgentRepository
        session = SessionLocal()
        try:
            repo = AgentRepository(session)
            count = repo.mark_stale_runs_failed()
            session.commit()
            if count:
                logging.getLogger(__name__).warning(
                    "Marked %d stale agent run(s) as failed on startup.", count
                )
        finally:
            session.close()

    return app


app = create_app()
