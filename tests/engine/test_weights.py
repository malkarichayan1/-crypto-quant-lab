import pytest
import pandas as pd

from hedgefund.dsl.spec import (
    CrossSectionalSelection,
    Sizing,
    TimeSeriesSelection,
    Condition,
)
from hedgefund.engine.weights import target_weights


def test_cross_sectional_long_top_equal_weight():
    indicator_row = pd.Series({"AAA": 0.2, "BBB": 0.5, "CCC": 0.1})
    tradable = ["AAA", "BBB", "CCC"]
    sel = CrossSectionalSelection(mode="cross_sectional", rank_by="m", long_top=2, short_bottom=0)
    sizing = Sizing(scheme="equal_weight", gross_leverage=1.0)
    w = target_weights(sel, sizing, {"m": indicator_row}, tradable, prev_state={})
    assert w["BBB"] == 0.5
    assert w["AAA"] == 0.5
    assert "CCC" not in w


def test_cross_sectional_long_short():
    indicator_row = pd.Series({"AAA": 0.2, "BBB": 0.5, "CCC": 0.1, "DDD": -0.3})
    tradable = ["AAA", "BBB", "CCC", "DDD"]
    sel = CrossSectionalSelection(mode="cross_sectional", rank_by="m", long_top=1, short_bottom=1)
    sizing = Sizing(scheme="equal_weight", gross_leverage=1.0)
    w = target_weights(sel, sizing, {"m": indicator_row}, tradable, prev_state={})
    assert w["BBB"] == 0.5
    assert w["DDD"] == -0.5


def test_unsupported_sizing_scheme_raises():
    indicator_row = pd.Series({"AAA": 0.2, "BBB": 0.5})
    sel = CrossSectionalSelection(mode="cross_sectional", rank_by="m", long_top=1, short_bottom=0)
    sizing = Sizing(scheme="inverse_vol", vol_indicator_id="v")
    with pytest.raises(NotImplementedError, match="equal_weight"):
        target_weights(sel, sizing, {"m": indicator_row}, ["AAA", "BBB"], prev_state={})


def test_cross_sectional_overlap_longs_take_priority_no_flip():
    indicator_row = pd.Series({"AAA": 0.2, "BBB": 0.5})
    tradable = ["AAA", "BBB"]
    sel = CrossSectionalSelection(mode="cross_sectional", rank_by="m", long_top=2, short_bottom=2)
    sizing = Sizing(scheme="equal_weight", gross_leverage=1.0)
    w = target_weights(sel, sizing, {"m": indicator_row}, tradable, prev_state={})
    # both selected as longs (no symbol left to short); neither may be negative
    assert w["AAA"] == 0.5
    assert w["BBB"] == 0.5
    assert all(v > 0 for v in w.values())


def test_time_series_entry_then_hold_until_exit():
    sel = TimeSeriesSelection(
        mode="time_series",
        entry=Condition(indicator_id="r", op="<", value=30),
        exit=Condition(indicator_id="r", op=">", value=70),
    )
    sizing = Sizing(scheme="equal_weight", gross_leverage=1.0)
    tradable = ["AAA"]
    w1 = target_weights(sel, sizing, {"r": pd.Series({"AAA": 25.0})}, tradable, prev_state={})
    assert w1["AAA"] == 1.0
    state = {"AAA": True}
    w2 = target_weights(sel, sizing, {"r": pd.Series({"AAA": 50.0})}, tradable, prev_state=state)
    assert w2["AAA"] == 1.0
    w3 = target_weights(sel, sizing, {"r": pd.Series({"AAA": 80.0})}, tradable, prev_state=state)
    assert w3.get("AAA", 0.0) == 0.0
