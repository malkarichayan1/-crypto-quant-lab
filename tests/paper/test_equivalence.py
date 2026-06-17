import pandas as pd
import pytest

from hedgefund.data.panel import PricePanel
from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.backtest import run_backtest
from hedgefund.engine.indicators import compute_all
from hedgefund.paper.engine import step
from hedgefund.paper.state import PaperState


def _panel(index, prices):
    df = pd.DataFrame({"BTC/USDT": prices}, index=pd.DatetimeIndex(index))
    return PricePanel(open=df, high=df, low=df, close=df, volume=df * 0 + 1.0)


def _spec(rebalance: str) -> StrategySpec:
    return StrategySpec.model_validate({
        "name": "always-long",
        "universe": ["BTC/USDT"],
        "indicators": [{"type": "sma", "id": "s", "period": 1}],
        "selection": {
            "mode": "time_series",
            "entry": {"indicator_id": "s", "op": ">", "value": 0},
            "exit": {"indicator_id": "s", "op": "<", "value": 0},
        },
        "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
        "costs": {"fee_bps": 10.0, "slippage_bps": 5.0},
        "rebalance": rebalance,
        "start": "2026-06-15",
        "end": "2026-06-26",
    })


@pytest.mark.parametrize("rebalance", ["daily", "weekly"])
def test_step_loop_matches_run_backtest(rebalance):
    dates = pd.bdate_range("2026-06-15", "2026-06-26")
    prices = [100, 102, 101, 105, 108, 107, 110, 109, 112, 115][: len(dates)]
    panel = _panel([d.isoformat() for d in dates], [float(p) for p in prices])
    spec = _spec(rebalance)

    bt = run_backtest(spec, panel, starting_cash=10_000.0)

    indicators = compute_all(spec.indicators, panel.close)
    s = PaperState.initial(10_000.0)
    paper_eq = []
    for ts in panel.close.index:
        s, _, eq = step(spec, s, panel, indicators, ts)
        paper_eq.append(eq)

    assert paper_eq == pytest.approx(list(bt.equity_curve.to_numpy()), rel=1e-9)
