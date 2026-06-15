from __future__ import annotations

from fastapi import FastAPI

from hedgefund.api.routes.backtests import router as backtests_router


def create_app() -> FastAPI:
    app = FastAPI(title="HedgeFund Simulator API", version="0.1.0")
    app.include_router(backtests_router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
