from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from hedgefund.api.deps import get_news_cache
from hedgefund.api.manual_schemas import NewsItemOut, NewsResponse
from hedgefund.manual.news import NewsCache, NewsUnavailableError

router = APIRouter(prefix="/news", tags=["news"])


@router.get("", response_model=NewsResponse)
def list_news(news: NewsCache = Depends(get_news_cache)) -> NewsResponse:
    try:
        snapshot = news.get_news()
    except NewsUnavailableError:
        raise HTTPException(
            status_code=503, detail="News is temporarily unavailable — try again shortly."
        )
    return NewsResponse(
        items=[NewsItemOut.model_validate(i) for i in snapshot.items],
        stale=snapshot.stale,
        fetched_at=snapshot.fetched_at,
    )
