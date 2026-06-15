import uuid
from datetime import datetime, timezone

from hedgefund.api.schemas import (
    BacktestResultResponse,
    BacktestSummary,
    CreateBacktestRequest,
)
from hedgefund.dsl.spec import StrategySpec


def _minimal_spec_dict():
    return {
        "name": "t",
        "universe": ["AAA"],
        "indicators": [{"type": "momentum", "id": "m1", "lookback": 1}],
        "selection": {"mode": "cross_sectional", "rank_by": "m1", "long_top": 1, "short_bottom": 0},
        "start": "2020-01-01",
        "end": "2020-01-05",
    }


def test_create_request_defaults_starting_cash():
    req = CreateBacktestRequest(spec=StrategySpec(**_minimal_spec_dict()))
    assert req.starting_cash == 10_000.0


def test_summary_round_trips():
    s = BacktestSummary(
        id=uuid.uuid4(),
        name="t",
        created_at=datetime.now(timezone.utc),
        duration_ms=12,
        metrics={"sharpe": 1.0},
    )
    assert s.metrics["sharpe"] == 1.0


def test_result_response_allows_null_benchmark_curve():
    r = BacktestResultResponse(
        id=uuid.uuid4(),
        name="t",
        created_at=datetime.now(timezone.utc),
        duration_ms=12,
        starting_cash=10_000.0,
        spec=_minimal_spec_dict(),
        equity_curve=[["2020-01-01", 100.0]],
        benchmark_curve=None,
        trade_log=[],
        metrics={"sharpe": 1.0},
    )
    assert r.benchmark_curve is None
