import json

from hedgefund.dsl.spec import StrategySpec
from hedgefund.dsl.validate import validate_spec
from hedgefund.engine.backtest import run_backtest
from hedgefund.risk.metrics import summarize
from tests.fixtures.panels import single_asset_panel


def test_example_momentum_spec_runs_end_to_end(tmp_path):
    spec_dict = {
        "name": "e2e",
        "universe": ["AAA"],
        "indicators": [{"type": "momentum", "id": "m1", "lookback": 1}],
        "selection": {"mode": "cross_sectional", "rank_by": "m1", "long_top": 1, "short_bottom": 0},
        "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
        "rebalance": "daily",
        "costs": {"fee_bps": 10, "slippage_bps": 5},
        "start": "2020-01-01",
        "end": "2020-01-05",
    }
    path = tmp_path / "spec.json"
    path.write_text(json.dumps(spec_dict))

    spec = StrategySpec.model_validate(json.loads(path.read_text()))
    validate_spec(spec)
    panel = single_asset_panel([100.0, 110.0, 121.0, 133.1, 146.41])
    result = run_backtest(spec, panel, starting_cash=10_000.0)
    metrics = summarize(result.equity_curve, periods_per_year=365)

    assert metrics["total_return"] > 0
    assert "sharpe" in metrics
    assert len(result.equity_curve) == 5
