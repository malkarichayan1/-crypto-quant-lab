import pytest

from hedgefund.dsl.spec import StrategySpec
from hedgefund.dsl.validate import SpecValidationError, validate_spec


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


def test_valid_spec_passes():
    validate_spec(StrategySpec.model_validate(_base()))


def test_unknown_rank_by_indicator_raises():
    d = _base()
    d["selection"]["rank_by"] = "does_not_exist"
    with pytest.raises(SpecValidationError, match="rank_by"):
        validate_spec(StrategySpec.model_validate(d))


def test_selection_exceeds_universe_raises():
    d = _base()
    d["selection"]["long_top"] = 5
    with pytest.raises(SpecValidationError, match="exceeds universe"):
        validate_spec(StrategySpec.model_validate(d))


def test_inverse_vol_requires_vol_indicator():
    d = _base()
    d["sizing"] = {"scheme": "inverse_vol", "vol_indicator_id": "missing"}
    with pytest.raises(SpecValidationError, match="inverse_vol"):
        validate_spec(StrategySpec.model_validate(d))


def test_end_before_start_raises():
    d = _base()
    d["end"] = "2019-01-01"
    with pytest.raises(SpecValidationError, match="end"):
        validate_spec(StrategySpec.model_validate(d))
