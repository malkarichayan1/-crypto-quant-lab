import numpy as np

from tests.fixtures.panels import two_asset_panel


def test_panel_exposes_ohlc_and_tradability():
    panel = two_asset_panel()
    dates = panel.dates
    assert list(panel.symbols) == ["AAA", "BBB"]
    assert panel.is_tradable("AAA", dates[0]) is False
    assert panel.is_tradable("AAA", dates[1]) is True
    assert panel.close_at("BBB", dates[0]) == 100.0
    assert np.isnan(panel.close.loc[dates[0], "AAA"])
