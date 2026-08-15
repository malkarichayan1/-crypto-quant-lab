from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from hedgefund.api.db.engine import get_session
from hedgefund.api.db.manual_repository import ManualRepository
from hedgefund.api.deps import get_device_id
from hedgefund.api.manual_schemas import WatchlistResponse
from hedgefund.data.universe import KRAKEN_LIVE_UNIVERSE
from hedgefund.manual.market_data import base_symbol

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

# Validated against the live-quote universe, not the full backtesting
# DEFAULT_UNIVERSE: starring a symbol MarketDataCache can never quote would
# silently never appear anywhere in the UI (Markets search/list is itself
# already scoped to MarketDataCache's actual output, so this mismatch isn't
# reachable through normal navigation — but the API should still reject it).
_BASE_SYMBOLS = {base_symbol(p) for p in KRAKEN_LIVE_UNIVERSE}


@router.get("", response_model=WatchlistResponse)
def get_watchlist(
    session: Session = Depends(get_session), device_id: str = Depends(get_device_id)
) -> WatchlistResponse:
    return WatchlistResponse(symbols=ManualRepository(session, device_id).list_watchlist())


@router.put("/{symbol}", response_model=WatchlistResponse)
def star(
    symbol: str,
    session: Session = Depends(get_session),
    device_id: str = Depends(get_device_id),
) -> WatchlistResponse:
    symbol = symbol.upper()
    if symbol not in _BASE_SYMBOLS:
        raise HTTPException(status_code=422, detail="Unknown coin.")
    repo = ManualRepository(session, device_id)
    repo.star(symbol)
    session.commit()
    return WatchlistResponse(symbols=repo.list_watchlist())


@router.delete("/{symbol}", response_model=WatchlistResponse)
def unstar(
    symbol: str,
    session: Session = Depends(get_session),
    device_id: str = Depends(get_device_id),
) -> WatchlistResponse:
    repo = ManualRepository(session, device_id)
    repo.unstar(symbol.upper())
    session.commit()
    return WatchlistResponse(symbols=repo.list_watchlist())
