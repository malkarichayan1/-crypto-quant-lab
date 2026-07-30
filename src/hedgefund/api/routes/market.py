from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from hedgefund.api.deps import get_market_data
from hedgefund.api.manual_schemas import (
    AssetQuoteOut,
    CandleOut,
    CandlesResponse,
    MarketAssetsResponse,
)
from hedgefund.manual.market_data import (
    RANGE_SPECS,
    MarketDataCache,
    PricesUnavailableError,
    UnknownSymbolError,
)

router = APIRouter(prefix="/market", tags=["market"])

_UNAVAILABLE_MSG = "Prices are temporarily unavailable — please try again shortly."


@router.get("/assets", response_model=MarketAssetsResponse)
def list_assets(market: MarketDataCache = Depends(get_market_data)) -> MarketAssetsResponse:
    try:
        snap = market.get_assets()
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    return MarketAssetsResponse(
        assets=[AssetQuoteOut.model_validate(a) for a in snap.assets],
        stale=snap.stale,
        as_of=snap.as_of,
    )


@router.get("/assets/{symbol}/candles", response_model=CandlesResponse)
def get_candles(
    symbol: str,
    range: str = Query("1D"),
    market: MarketDataCache = Depends(get_market_data),
) -> CandlesResponse:
    if range not in RANGE_SPECS:
        raise HTTPException(
            status_code=422, detail=f"range must be one of {sorted(RANGE_SPECS)}"
        )
    try:
        series = market.get_candles(symbol.upper(), range)
    except UnknownSymbolError:
        raise HTTPException(status_code=404, detail="Unknown coin.")
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    return CandlesResponse(
        symbol=series.symbol,
        range=series.range_key,
        candles=[CandleOut.model_validate(c) for c in series.candles],
        stale=series.stale,
    )
