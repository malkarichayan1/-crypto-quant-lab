from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from hedgefund.api.db.engine import get_session
from hedgefund.api.db.manual_repository import ManualRepository
from hedgefund.api.deps import get_market_data
from hedgefund.api.manual_schemas import (
    EquityPointOut,
    EquitySeriesResponse,
    ManualOrderOut,
    PlaceOrderRequest,
    PortfolioCreatedResponse,
    PortfolioResponse,
    ResetPortfolioRequest,
)
from hedgefund.manual.market_data import PricesUnavailableError, UnknownSymbolError
from hedgefund.manual.portfolio_math import OrderValidationError
from hedgefund.manual.portfolio_service import (
    DEFAULT_STARTING_CASH,
    EQUITY_RANGE_DAYS,
    get_equity_series,
    get_portfolio_view,
    place_order,
)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

_UNAVAILABLE_MSG = "Prices are temporarily unavailable — please try again shortly."


@router.get("", response_model=PortfolioResponse)
def get_portfolio(
    session: Session = Depends(get_session), market=Depends(get_market_data)
) -> PortfolioResponse:
    repo = ManualRepository(session)
    try:
        view = get_portfolio_view(repo, market)
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    session.commit()  # first call may create the bootstrap portfolio row
    return PortfolioResponse.model_validate(view)


@router.get("/orders", response_model=list[ManualOrderOut])
def list_orders(session: Session = Depends(get_session)) -> list[ManualOrderOut]:
    repo = ManualRepository(session)
    portfolio = repo.get_or_create_active_portfolio(DEFAULT_STARTING_CASH)
    session.commit()
    rows = repo.list_orders(portfolio.id)
    return [ManualOrderOut.model_validate(row) for row in reversed(rows)]


@router.post("/orders", response_model=ManualOrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    body: PlaceOrderRequest,
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
) -> ManualOrderOut:
    repo = ManualRepository(session)
    try:
        row = place_order(
            repo, market,
            symbol=body.symbol.upper(), side=body.side, usd_amount=body.usd_amount,
        )
    except OrderValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except UnknownSymbolError:
        raise HTTPException(status_code=404, detail="Unknown coin.")
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    session.commit()
    session.refresh(row)
    return ManualOrderOut.model_validate(row)


@router.get("/equity", response_model=EquitySeriesResponse)
def equity_series(
    range: str = Query("1M"),
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
) -> EquitySeriesResponse:
    if range not in EQUITY_RANGE_DAYS:
        raise HTTPException(
            status_code=422, detail=f"range must be one of {sorted(EQUITY_RANGE_DAYS)}"
        )
    repo = ManualRepository(session)
    try:
        points = get_equity_series(repo, market, range)
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    session.commit()
    return EquitySeriesResponse(
        range=range,
        points=[EquityPointOut(ts=ts, equity=equity) for ts, equity in points],
    )


@router.post("/reset", response_model=PortfolioCreatedResponse,
             status_code=status.HTTP_201_CREATED)
def reset_portfolio(
    body: ResetPortfolioRequest, session: Session = Depends(get_session)
) -> PortfolioCreatedResponse:
    repo = ManualRepository(session)
    row = repo.create_portfolio(starting_cash=body.starting_cash)
    session.commit()
    session.refresh(row)
    return PortfolioCreatedResponse.model_validate(row)
