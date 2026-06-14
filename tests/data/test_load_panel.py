from datetime import date

from hedgefund.data.cache import write_symbol
from hedgefund.data.fetch import ohlcv_to_frame
from hedgefund.data.panel import load_panel


def test_load_panel_aligns_symbols_and_marks_pre_listing_nan(tmp_path):
    aaa = ohlcv_to_frame(
        [
            [1577836800000, 10, 11, 9, 10.5, 1],
            [1577923200000, 10.5, 12, 10, 11.0, 1],
        ]
    )
    bbb = ohlcv_to_frame([[1577923200000, 20, 21, 19, 20.5, 1]])
    write_symbol("AAA/USDT", aaa, cache_dir=tmp_path)
    write_symbol("BBB/USDT", bbb, cache_dir=tmp_path)

    panel = load_panel(
        ["AAA/USDT", "BBB/USDT"], date(2020, 1, 1), date(2020, 1, 2), cache_dir=tmp_path
    )
    d0 = panel.dates[0]
    assert panel.is_tradable("AAA/USDT", d0) is True
    assert panel.is_tradable("BBB/USDT", d0) is False
