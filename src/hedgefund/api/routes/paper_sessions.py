from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from hedgefund.api import events
from hedgefund.api.db.engine import get_session
from hedgefund.api.db.paper_repository import PaperRepository
from hedgefund.api.db.repository import BacktestRepository
from hedgefund.api.paper_schemas import (
    CreatePaperSessionRequest,
    PaperEquityOut,
    PaperSessionDetail,
    PaperSessionResponse,
    PaperTradeOut,
)
from hedgefund.paper.service import SpecResolutionError, resolve_spec
from hedgefund.paper.state import PaperState

router = APIRouter(prefix="/paper-sessions", tags=["paper-sessions"])


def _lookup_backtest_spec(session: Session):
    repo = BacktestRepository(session)

    def _lookup(backtest_id):
        row = repo.get(uuid.UUID(str(backtest_id)))
        return row.spec if row is not None else None

    return _lookup


@router.post("", response_model=PaperSessionResponse, status_code=status.HTTP_201_CREATED)
def create_paper_session(
    body: CreatePaperSessionRequest,
    session: Session = Depends(get_session),
) -> PaperSessionResponse:
    try:
        spec, universe = resolve_spec(
            spec_json=body.spec_json,
            source_backtest_id=body.source_backtest_id,
            backtest_spec_lookup=_lookup_backtest_spec(session),
        )
    except SpecResolutionError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    repo = PaperRepository(session)
    row = repo.create_session(
        label=body.label,
        spec_json=spec.model_dump(mode="json"),
        source_backtest_id=body.source_backtest_id,
        universe=universe,
        timeframe="1h",
        starting_cash=body.starting_cash,
        state_json=PaperState.initial(
            body.starting_cash,
            start_ts=datetime.now(timezone.utc).isoformat(),
        ).to_json(),
    )
    session.commit()
    session.refresh(row)
    events.create_queue(row.id)
    return PaperSessionResponse.model_validate(row)


@router.get("", response_model=list[PaperSessionResponse])
def list_paper_sessions(session: Session = Depends(get_session)) -> list[PaperSessionResponse]:
    repo = PaperRepository(session)
    return [PaperSessionResponse.model_validate(r) for r in repo.list_sessions()]


@router.get("/{session_id}", response_model=PaperSessionDetail)
def get_paper_session(
    session_id: uuid.UUID, session: Session = Depends(get_session)
) -> PaperSessionDetail:
    repo = PaperRepository(session)
    row = repo.get_session(session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="paper session not found")
    detail = PaperSessionDetail.model_validate(row)
    detail.equity = [PaperEquityOut.model_validate(e) for e in repo.list_equity(session_id)]
    detail.trades = [PaperTradeOut.model_validate(t) for t in repo.list_trades(session_id)]
    return detail


@router.post("/{session_id}/stop", response_model=PaperSessionResponse)
def stop_paper_session(
    session_id: uuid.UUID, session: Session = Depends(get_session)
) -> PaperSessionResponse:
    repo = PaperRepository(session)
    row = repo.get_session(session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="paper session not found")
    repo.stop_session(session_id)
    session.commit()
    session.refresh(row)
    return PaperSessionResponse.model_validate(row)


@router.get("/{session_id}/events")
async def stream_paper_session_events(
    session_id: uuid.UUID, session: Session = Depends(get_session)
) -> StreamingResponse:
    repo = PaperRepository(session)
    row = repo.get_session(session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="paper session not found")

    equity_data = [{"ts": e.ts.isoformat(), "equity": e.equity} for e in repo.list_equity(session_id)]
    trades_by_ts: dict[str, list] = {}
    for t in repo.list_trades(session_id):
        trades_by_ts.setdefault(t.ts.isoformat(), []).append(
            {"symbol": t.symbol, "units": t.units, "price": t.price}
        )
    sess_status = row.status

    async def generate():
        for e in equity_data:
            payload = {
                "type": "tick", "ts": e["ts"], "equity": e["equity"],
                "fills": trades_by_ts.get(e["ts"], []), "is_catchup": True,
            }
            yield f"event: tick\ndata: {json.dumps(payload)}\n\n"

        if sess_status in ("stopped", "error"):
            yield f"event: session_stopped\ndata: {json.dumps({'type': 'session_stopped', 'status': sess_status})}\n\n"
            return

        queue = events.get_queue(session_id)
        if queue is None:
            return
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=30.0)
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
                continue
            if item is None:
                break
            yield f"event: {item['type']}\ndata: {json.dumps(item)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
