from __future__ import annotations

import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from hedgefund.api.db.engine import get_session
from hedgefund.api.db.repository import BacktestRepository
from hedgefund.api.deps import PanelLoader, get_panel_loader
from hedgefund.api.schemas import (
    BacktestResultResponse,
    BacktestSummary,
    CreateBacktestRequest,
)
from hedgefund.api.serialization import curve_to_json, trades_to_json
from hedgefund.dsl.validate import SpecValidationError, validate_spec
from hedgefund.engine.backtest import run_backtest
from hedgefund.risk.metrics import summarize

router = APIRouter(prefix="/backtests", tags=["backtests"])


@router.post("", response_model=BacktestResultResponse, status_code=status.HTTP_201_CREATED)
def create_backtest(
    body: CreateBacktestRequest,
    session: Session = Depends(get_session),
    panel_loader: PanelLoader = Depends(get_panel_loader),
) -> BacktestResultResponse:
    spec = body.spec
    try:
        validate_spec(spec)
    except SpecValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not isinstance(spec.universe, list):
        raise HTTPException(status_code=400, detail="universe='all' not supported yet")

    symbols = list(dict.fromkeys([*spec.universe, spec.benchmark]))
    try:
        panel = panel_loader(symbols, spec.start, spec.end)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=400, detail=f"missing market data for one of {symbols}"
        ) from exc

    started = time.perf_counter()
    result = run_backtest(spec, panel, starting_cash=body.starting_cash)
    duration_ms = int((time.perf_counter() - started) * 1000)

    if result.benchmark_curve is not None:
        metrics = summarize(result.equity_curve, benchmark=result.benchmark_curve)
    else:
        metrics = summarize(result.equity_curve)

    repo = BacktestRepository(session)
    row = repo.create(
        name=spec.name,
        spec=spec.model_dump(mode="json"),
        equity_curve=curve_to_json(result.equity_curve),
        benchmark_curve=curve_to_json(result.benchmark_curve),
        trade_log=trades_to_json(result.trade_log),
        metrics=metrics,
        starting_cash=body.starting_cash,
        duration_ms=duration_ms,
    )
    session.commit()
    session.refresh(row)
    return BacktestResultResponse.model_validate(row)


@router.get("", response_model=list[BacktestSummary])
def list_backtests(session: Session = Depends(get_session)) -> list[BacktestSummary]:
    repo = BacktestRepository(session)
    return [BacktestSummary.model_validate(r) for r in repo.list()]


@router.get("/{backtest_id}", response_model=BacktestResultResponse)
def get_backtest(
    backtest_id: uuid.UUID, session: Session = Depends(get_session)
) -> BacktestResultResponse:
    repo = BacktestRepository(session)
    row = repo.get(backtest_id)
    if row is None:
        raise HTTPException(status_code=404, detail="backtest not found")
    return BacktestResultResponse.model_validate(row)


@router.delete("/{backtest_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_backtest(
    backtest_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    repo = BacktestRepository(session)
    if not repo.delete(backtest_id):
        raise HTTPException(status_code=404, detail="backtest not found")
    session.commit()
