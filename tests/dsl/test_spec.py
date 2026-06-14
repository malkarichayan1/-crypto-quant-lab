from datetime import date

from hedgefund.dsl.spec import StrategySpec


def test_parses_minimal_momentum_spec():
    spec = StrategySpec.model_validate(
        {
            "name": "mom",
            "universe": ["BTC/USDT", "ETH/USDT"],
            "indicators": [{"type": "momentum", "id": "m90", "lookback": 90}],
            "selection": {
                "mode": "cross_sectional",
                "rank_by": "m90",
                "long_top": 1,
                "short_bottom": 0,
            },
            "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
            "rebalance": "weekly",
            "costs": {"fee_bps": 10, "slippage_bps": 5},
            "start": "2020-01-01",
            "end": "2021-01-01",
        }
    )
    assert spec.name == "mom"
    assert spec.indicators[0].lookback == 90
    assert spec.selection.long_top == 1
    assert spec.start == date(2020, 1, 1)
