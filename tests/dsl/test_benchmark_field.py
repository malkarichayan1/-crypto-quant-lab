from hedgefund.dsl.spec import StrategySpec


def _base() -> dict:
    return {
        "name": "x",
        "universe": ["BTC/USDT", "ETH/USDT"],
        "indicators": [{"type": "momentum", "id": "m90", "lookback": 90}],
        "selection": {
            "mode": "cross_sectional",
            "rank_by": "m90",
            "long_top": 1,
            "short_bottom": 0,
        },
        "sizing": {"scheme": "equal_weight"},
        "rebalance": "daily",
        "costs": {},
        "start": "2020-01-01",
        "end": "2021-01-01",
    }


def test_benchmark_defaults_to_btc():
    spec = StrategySpec.model_validate(_base())
    assert spec.benchmark == "BTC/USDT"


def test_benchmark_can_be_overridden():
    d = _base()
    d["benchmark"] = "ETH/USDT"
    spec = StrategySpec.model_validate(d)
    assert spec.benchmark == "ETH/USDT"
