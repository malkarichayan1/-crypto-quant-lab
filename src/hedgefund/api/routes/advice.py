from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from hedgefund.api.config import get_settings
from hedgefund.api.db.engine import get_session
from hedgefund.api.db.manual_repository import ManualRepository
from hedgefund.api.deps import get_call_llm, get_device_id, get_market_data
from hedgefund.api.manual_schemas import AdvicePayloadOut, AdviceResponse
from hedgefund.manual import advice as adv
from hedgefund.manual.market_data import PricesUnavailableError, UnknownSymbolError
from hedgefund.manual.portfolio_service import DEFAULT_STARTING_CASH, get_portfolio_view

router = APIRouter(prefix="/advice", tags=["advice"])

_UNAVAILABLE_MSG = "Prices are temporarily unavailable — please try again shortly."


def _disabled() -> AdviceResponse:
    return AdviceResponse(enabled=False, advice=None)


def _scope_for(symbol: str | None, market) -> str:
    """Validate an optional ?symbol= and turn it into a cache scope."""
    if symbol is None:
        return adv.PORTFOLIO_SCOPE
    upper = symbol.upper()
    try:
        market.pair_for(upper)
    except UnknownSymbolError:
        raise HTTPException(status_code=404, detail="Unknown coin.")
    return upper


@router.get("", response_model=AdviceResponse)
def read_advice(
    symbol: str | None = Query(None),
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
    device_id: str = Depends(get_device_id),
) -> AdviceResponse:
    """Cached advice only — deliberately never calls the LLM, so simply opening
    the Dashboard costs nothing."""
    if not get_settings().advisor_enabled:
        return _disabled()

    scope = _scope_for(symbol, market)
    repo = ManualRepository(session, device_id)
    portfolio = repo.get_or_create_active_portfolio(DEFAULT_STARTING_CASH)
    session.commit()

    payload = adv.read_cached_advice(repo, portfolio.id, scope=scope)
    return AdviceResponse(
        enabled=True,
        advice=None if payload is None else AdvicePayloadOut.model_validate(payload),
    )


@router.post("", response_model=AdviceResponse, status_code=status.HTTP_201_CREATED)
def create_advice(
    response: Response,
    symbol: str | None = Query(None),
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
    call_llm=Depends(get_call_llm),
    device_id: str = Depends(get_device_id),
) -> AdviceResponse:
    """Generate advice on demand. Reuses a fresh cache entry if one exists."""
    if not get_settings().advisor_enabled:
        # Not an error: the client asked for something the operator turned off.
        response.status_code = status.HTTP_200_OK
        return _disabled()

    scope = _scope_for(symbol, market)
    repo = ManualRepository(session, device_id)
    try:
        view = get_portfolio_view(repo, market)
        payload = adv.generate_advice(repo, market, call_llm, view=view, scope=scope)
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    except UnknownSymbolError:
        # Currently unreachable: _scope_for() above already validates `symbol`
        # via market.pair_for() and 404s before we get here. Kept as
        # defensive plumbing matching manual_portfolio.py's create_order,
        # in case get_portfolio_view/generate_advice ever start raising it.
        raise HTTPException(status_code=404, detail="Unknown coin.")
    session.commit()
    return AdviceResponse(enabled=True, advice=AdvicePayloadOut.model_validate(payload))
