from hedgefund.data.cache import write_symbol, read_symbol, cached_symbols
from hedgefund.data.fetch import ohlcv_to_frame


def test_ohlcv_rows_become_indexed_frame():
    rows = [
        [1577836800000, 100.0, 105.0, 99.0, 104.0, 10.0],
        [1577923200000, 104.0, 106.0, 102.0, 103.0, 12.0],
    ]
    df = ohlcv_to_frame(rows)
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert str(df.index[0].date()) == "2020-01-01"
    assert df["close"].iloc[1] == 103.0


def test_cache_round_trip(tmp_path):
    df = ohlcv_to_frame([[1577836800000, 100.0, 105.0, 99.0, 104.0, 10.0]])
    write_symbol("BTC/USDT", df, cache_dir=tmp_path)
    back = read_symbol("BTC/USDT", cache_dir=tmp_path)
    assert back["close"].iloc[0] == 104.0
    assert "BTC/USDT" in cached_symbols(cache_dir=tmp_path)
