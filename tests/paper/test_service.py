import pytest

from hedgefund.paper.service import SpecResolutionError, resolve_spec


def _spec_json():
    return {
        "name": "x",
        "universe": ["BTC/USDT", "ETH/USDT"],
        "indicators": [{"type": "sma", "id": "s", "period": 2}],
        "selection": {
            "mode": "time_series",
            "entry": {"indicator_id": "s", "op": ">", "value": 0},
            "exit": {"indicator_id": "s", "op": "<", "value": 0},
        },
        "start": "2026-06-17",
        "end": "2026-06-30",
    }


def test_resolve_from_spec_json_returns_spec_and_universe():
    spec, universe = resolve_spec(
        spec_json=_spec_json(),
        source_backtest_id=None,
        backtest_spec_lookup=lambda _id: None,
    )
    assert spec.name == "x"
    assert universe == ["BTC/USDT", "ETH/USDT"]


def test_resolve_from_backtest_id_uses_lookup():
    spec, universe = resolve_spec(
        spec_json=None,
        source_backtest_id="abc",
        backtest_spec_lookup=lambda _id: _spec_json(),
    )
    assert universe == ["BTC/USDT", "ETH/USDT"]


def test_resolve_rejects_neither_source():
    with pytest.raises(SpecResolutionError):
        resolve_spec(
            spec_json=None,
            source_backtest_id=None,
            backtest_spec_lookup=lambda _id: None,
        )


def test_resolve_rejects_both_sources():
    with pytest.raises(SpecResolutionError):
        resolve_spec(
            spec_json=_spec_json(),
            source_backtest_id="abc",
            backtest_spec_lookup=lambda _id: _spec_json(),
        )


def test_resolve_rejects_unknown_backtest():
    with pytest.raises(SpecResolutionError):
        resolve_spec(
            spec_json=None,
            source_backtest_id="missing",
            backtest_spec_lookup=lambda _id: None,
        )


def test_resolve_rejects_invalid_spec_json():
    with pytest.raises(SpecResolutionError):
        resolve_spec(
            spec_json={"name": "broken"},
            source_backtest_id=None,
            backtest_spec_lookup=lambda _id: None,
        )
