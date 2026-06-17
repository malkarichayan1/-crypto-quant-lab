from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hedgefund.api.routes.backtests import router as backtests_router
from hedgefund.api.routes.agent_runs import router as agent_runs_router
from hedgefund.api.routes.paper_sessions import router as paper_sessions_router


def create_app() -> FastAPI:
    app = FastAPI(title="HedgeFund Simulator API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(backtests_router)
    app.include_router(agent_runs_router)
    app.include_router(paper_sessions_router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

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
