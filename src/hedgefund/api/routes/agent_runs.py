from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from hedgefund.agents import runner as agent_runner
from hedgefund.agents.llm import CallLLM
from hedgefund.api import events
from hedgefund.api.agent_schemas import (
    AgentIterationSummary,
    AgentRunDetailResponse,
    AgentRunResponse,
    CreateAgentRunRequest,
)
from hedgefund.api.db.agent_repository import AgentRepository
from hedgefund.api.db.engine import SessionLocal, get_session
from hedgefund.api.deps import get_call_llm, get_panel_loader

router = APIRouter(prefix="/agent-runs", tags=["agent-runs"])


@router.post("", response_model=AgentRunResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_agent_run(
    body: CreateAgentRunRequest,
    session: Session = Depends(get_session),
    call_llm: CallLLM = Depends(get_call_llm),
    panel_loader=Depends(get_panel_loader),
) -> AgentRunResponse:
    from hedgefund.api.config import get_settings

    repo = AgentRepository(session)
    run = repo.create_run(
        goal=body.goal,
        universe=body.universe,
        date_start=body.date_start,
        date_end=body.date_end,
        starting_cash=body.starting_cash,
        budget_usd=body.budget_usd,
        target_metric=body.target_metric,
        target_value=body.target_value,
        model=get_settings().anthropic_model,
    )
    session.commit()
    session.refresh(run)
    run_id = run.id

    queue = events.create_queue(run_id)

    asyncio.create_task(
        agent_runner.run_agent_loop(
            run_id=run_id,
            goal=body.goal,
            universe=body.universe,
            date_start=body.date_start.isoformat(),
            date_end=body.date_end.isoformat(),
            starting_cash=body.starting_cash,
            budget_usd=body.budget_usd,
            target_metric=body.target_metric,
            target_value=body.target_value,
            model=get_settings().anthropic_model,
            call_llm=call_llm,
            session_factory=SessionLocal,
            panel_loader=panel_loader,
            event_queue=queue,
        )
    )

    return AgentRunResponse.model_validate(run)


@router.get("", response_model=list[AgentRunResponse])
def list_agent_runs(session: Session = Depends(get_session)) -> list[AgentRunResponse]:
    repo = AgentRepository(session)
    return [AgentRunResponse.model_validate(r) for r in repo.list_runs()]


@router.get("/{run_id}", response_model=AgentRunDetailResponse)
def get_agent_run(
    run_id: uuid.UUID, session: Session = Depends(get_session)
) -> AgentRunDetailResponse:
    repo = AgentRepository(session)
    run = repo.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="agent run not found")
    iterations = repo.list_iterations(run_id)
    result = AgentRunDetailResponse.model_validate(run)
    result.iterations = [AgentIterationSummary.model_validate(it) for it in iterations]
    return result


@router.get("/{run_id}/events")
async def stream_agent_run_events(
    run_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> StreamingResponse:
    repo = AgentRepository(session)
    run = repo.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="agent run not found")

    # Capture persisted state before generator runs (session closes after route returns)
    iterations_data = [
        {
            "iteration_index": it.iteration_index,
            "research_note": it.research_note,
            "spec_json": it.spec_json,
            "backtest_id": str(it.backtest_id) if it.backtest_id else None,
            "metrics": it.metrics_snapshot,
            "critic_note": it.critic_note,
            "failed": it.failed,
        }
        for it in repo.list_iterations(run_id)
    ]
    run_status = run.status
    cost_usd = run.cost_usd
    winner_id = str(run.winner_backtest_id) if run.winner_backtest_id else None

    async def generate():
        for data in iterations_data:
            payload = {"type": "iteration_complete", **data}
            yield f"event: iteration_complete\ndata: {json.dumps(payload)}\n\n"

        if run_status in ("done", "failed"):
            yield (
                f"event: run_done\n"
                f"data: {json.dumps({'type': 'run_done', 'status': run_status, 'cost_usd': cost_usd, 'winner_backtest_id': winner_id})}\n\n"
            )
            return

        queue = events.get_queue(run_id)
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
