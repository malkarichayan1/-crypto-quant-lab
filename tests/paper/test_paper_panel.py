from hedgefund.api.paper_panel import build_panel_from_rows


def test_build_panel_from_rows_aligns_symbols():
    rows_by_symbol = {
        "BTC/USDT": [[0, 100, 101, 99, 100, 1], [3_600_000, 100, 102, 99, 110, 1]],
        "ETH/USDT": [[0, 10, 11, 9, 10, 5], [3_600_000, 10, 12, 9, 11, 5]],
    }
    panel = build_panel_from_rows(rows_by_symbol)
    assert list(panel.symbols) == ["BTC/USDT", "ETH/USDT"]
    assert len(panel.dates) == 2
    assert panel.close_at("BTC/USDT", panel.close.index[1]) == 110.0
    assert panel.open_at("ETH/USDT", panel.close.index[0]) == 10.0
