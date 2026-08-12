from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from hedgefund.api.db.engine import get_session
from hedgefund.api.db.manual_repository import ManualRepository
from hedgefund.api.db.paper_repository import PaperRepository
from hedgefund.api.deps import get_market_data
from hedgefund.api.manual_schemas import LeaderboardResponse, LeaderboardRowOut
from hedgefund.manual import leaderboard as lb
from hedgefund.manual.market_data import PricesUnavailableError, UnknownSymbolError
from hedgefund.manual.portfolio_service import get_equity_series, get_portfolio_view

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])

_UNAVAILABLE_MSG = "Prices are temporarily unavailable — please try again shortly."
BENCHMARK_SYMBOL = "BTC"
# Longest range MarketDataCache offers. A portfolio older than this gets a
# benchmark clamped to the oldest candle available — its start_date says so.
BENCHMARK_RANGE = "1Y"


def _benchmark_row(market, view) -> lb.LeaderboardRow | None:
    """Buy-and-hold BTC over the same window as the manual portfolio.

    A benchmark failure must not take down the whole leaderboard — the other
    rows are still worth showing, so this degrades to None.
    """
    try:
        series = market.get_candles(BENCHMARK_SYMBOL, BENCHMARK_RANGE)
    except (UnknownSymbolError, PricesUnavailableError):
        return None

    closes = [(c.ts, c.close) for c in series.candles]
    points = lb.buy_and_hold_series(
        closes, starting_cash=view.starting_cash, since=view.created_at
    )
    if not points:
        # The portfolio is newer than the newest candle (or older than the
        # oldest available). Fall back to the full candle window rather than
        # dropping the benchmark — its start_date makes the mismatch visible.
        points = lb.buy_and_hold_series(closes, starting_cash=view.starting_cash)

    return lb.row_from_series(
        f"Buy & hold {BENCHMARK_SYMBOL}", points,
        starting_cash=view.starting_cash, kind="benchmark",
    )


@router.get("", response_model=LeaderboardResponse)
def get_leaderboard(
    session: Session = Depends(get_session), market=Depends(get_market_data)
) -> LeaderboardResponse:
    manual = ManualRepository(session)
    paper = PaperRepository(session)

    try:
        view = get_portfolio_view(manual, market)
        you = lb.row_from_series(
            "You",
            get_equity_series(manual, market, "ALL"),
            starting_cash=view.starting_cash,
            kind="you",
        )
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    session.commit()  # get_portfolio_view may have bootstrapped the portfolio

    rows: list[lb.LeaderboardRow | None] = [you]

    for paper_session in paper.list_sessions():
        points = [(e.ts, e.equity) for e in paper.list_equity(paper_session.id)]
        rows.append(
            lb.row_from_series(
                paper_session.label, points,
                starting_cash=paper_session.starting_cash, kind="ai",
            )
        )

    rows.append(_benchmark_row(market, view))

    return LeaderboardResponse(
        rows=[LeaderboardRowOut.model_validate(r) for r in lb.rank_rows(rows)],
        stale=view.stale,
    )
