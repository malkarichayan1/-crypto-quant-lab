import pandas as pd

from hedgefund.api.serialization import curve_to_json, trades_to_json


def test_curve_to_json_emits_iso_date_value_pairs():
    idx = pd.DatetimeIndex(["2020-01-01", "2020-01-02"])
    series = pd.Series([100.0, 110.0], index=idx, name="equity")
    out = curve_to_json(series)
    assert out == [["2020-01-01", 100.0], ["2020-01-02", 110.0]]


def test_curve_to_json_handles_none():
    assert curve_to_json(None) is None


def test_trades_to_json_converts_dates_and_records():
    df = pd.DataFrame(
        {
            "date": pd.DatetimeIndex(["2020-01-02"]),
            "symbol": ["AAA"],
            "units": [1.5],
            "price": [100.0],
        }
    )
    out = trades_to_json(df)
    assert out == [{"date": "2020-01-02", "symbol": "AAA", "units": 1.5, "price": 100.0}]


def test_trades_to_json_handles_empty_frame():
    assert trades_to_json(pd.DataFrame()) == []
