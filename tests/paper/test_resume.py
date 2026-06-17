import pandas as pd

from hedgefund.data.panel import PricePanel
from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.indicators import compute_all
from hedgefund.paper.engine import step
from hedgefund.paper.state import PaperState


def _panel(index, prices):
    df = pd.DataFrame({"BTC/USDT": prices}, index=pd.DatetimeIndex(index))
    return PricePanel(open=df, high=df, low=df, close=df, volume=df * 0 + 1.0)


def _spec():
    return StrategySpec.model_validate({
        "name": "always-long", "universe": ["BTC/USDT"],
        "indicators": [{"type": "sma", "id": "s", "period": 1}],
        "selection": {"mode": "time_series",
                      "entry": {"indicator_id": "s", "op": ">", "value": 0},
                      "exit": {"indicator_id": "s", "op": "<", "value": 0}},
        "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
        "costs": {"fee_bps": 10.0, "slippage_bps": 5.0},
        "start": "2026-06-17", "end": "2026-06-30"})


def test_resume_from_serialized_state_matches_uninterrupted():
    index = ["2026-06-17T00:00:00", "2026-06-17T01:00:00",
             "2026-06-17T02:00:00", "2026-06-17T03:00:00"]
    panel = _panel(index, [100.0, 110.0, 105.0, 120.0])
    spec = _spec()
    indicators = compute_all(spec.indicators, panel.close)

    # Uninterrupted run across all four bars.
    s = PaperState.initial(10_000.0)
    eqs_a = []
    for ts in panel.close.index:
        s, _, eq = step(spec, s, panel, indicators, ts)
        eqs_a.append(eq)

    # Interrupted: run two bars, serialize -> deserialize, run the rest.
    s = PaperState.initial(10_000.0)
    eqs_b = []
    for ts in panel.close.index[:2]:
        s, _, eq = step(spec, s, panel, indicators, ts)
        eqs_b.append(eq)
    s = PaperState.from_json(s.to_json())  # simulate restart
    for ts in panel.close.index[2:]:
        s, _, eq = step(spec, s, panel, indicators, ts)
        eqs_b.append(eq)

    assert eqs_b == eqs_a
