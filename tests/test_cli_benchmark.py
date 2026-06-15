import json

from typer.testing import CliRunner

from hedgefund.cli import app
from hedgefund.data.cache import write_symbol
from hedgefund.data.fetch import ohlcv_to_frame


def _frame(closes):
    base_ms = 1577836800000  # 2020-01-01 UTC
    day_ms = 86_400_000
    rows = [[base_ms + i * day_ms, c, c, c, c, 1.0] for i, c in enumerate(closes)]
    return ohlcv_to_frame(rows)


def test_cli_run_prints_relative_metrics(tmp_path):
    write_symbol("AAA/USDT", _frame([100, 110, 121, 133.1, 146.41]), cache_dir=tmp_path)
    write_symbol("BTC/USDT", _frame([100, 105, 110, 115, 120]), cache_dir=tmp_path)
    spec = {
        "name": "cli_bench",
        "universe": ["AAA/USDT"],
        "indicators": [{"type": "momentum", "id": "m1", "lookback": 1}],
        "selection": {
            "mode": "cross_sectional",
            "rank_by": "m1",
            "long_top": 1,
            "short_bottom": 0,
        },
        "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
        "rebalance": "daily",
        "costs": {"fee_bps": 10, "slippage_bps": 5},
        "start": "2020-01-01",
        "end": "2020-01-05",
        "benchmark": "BTC/USDT",
    }
    spec_path = tmp_path / "spec.json"
    spec_path.write_text(json.dumps(spec))

    result = CliRunner().invoke(
        app, ["run", str(spec_path), "--cache-dir", str(tmp_path)]
    )
    assert result.exit_code == 0, result.stdout
    assert "information_ratio" in result.stdout
    assert "beta" in result.stdout
