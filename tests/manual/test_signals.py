from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from hedgefund.manual import signals as sig
from hedgefund.manual.market_data import Candle


def _series(closes: list[float]) -> tuple[Candle, ...]:
    base = datetime(2026, 8, 1, tzinfo=timezone.utc)
    return tuple(
        Candle(ts=base + timedelta(hours=i), open=c, high=c, low=c, close=c, volume=1.0)
        for i, c in enumerate(closes)
    )


def test_coin_signal_reports_golden_cross_when_short_sma_is_above_long():
    # 60 rising closes: the 5-period mean sits above the 20-period mean.
    candles = _series([100.0 + i for i in range(60)])

    signal = sig.coin_signal("BTC", candles, short_period=5, long_period=20, rsi_period=14)

    assert signal.sma_cross == "golden"
    assert signal.sma_short > signal.sma_long


def test_coin_signal_reports_death_cross_when_short_sma_is_below_long():
    candles = _series([160.0 - i for i in range(60)])

    signal = sig.coin_signal("BTC", candles, short_period=5, long_period=20, rsi_period=14)

    assert signal.sma_cross == "death"


def test_coin_signal_flags_overbought_when_every_bar_rises():
    # Uninterrupted gains drive RSI to 100.
    candles = _series([100.0 + i for i in range(60)])

    signal = sig.coin_signal("BTC", candles, short_period=5, long_period=20, rsi_period=14)

    assert signal.rsi_zone == "overbought"
    assert signal.rsi > 70


def test_coin_signal_flags_oversold_when_every_bar_falls():
    candles = _series([160.0 - i for i in range(60)])

    signal = sig.coin_signal("BTC", candles, short_period=5, long_period=20, rsi_period=14)

    assert signal.rsi_zone == "oversold"
    assert signal.rsi < 30


def test_coin_signal_returns_none_facts_when_history_is_too_short():
    # 3 bars cannot fill a 20-period SMA or a 14-period RSI.
    signal = sig.coin_signal("BTC", _series([100.0, 101.0, 102.0]),
                             short_period=5, long_period=20, rsi_period=14)

    assert signal.sma_short is None
    assert signal.sma_long is None
    assert signal.rsi is None
    assert signal.sma_cross == "none"
    assert signal.rsi_zone == "neutral"


def test_coin_signal_raises_on_empty_candles():
    with pytest.raises(ValueError, match="no candles"):
        sig.coin_signal("BTC", (), short_period=5, long_period=20, rsi_period=14)


def test_coin_signal_computes_momentum_pct_for_a_rising_series():
    # 30 bars is enough to look back MOMENTUM_LOOKBACK (24) bars from the end.
    closes = [100.0 + i for i in range(30)]
    candles = _series(closes)

    signal = sig.coin_signal("BTC", candles, short_period=5, long_period=20, rsi_period=14)

    past_close = closes[-(sig.MOMENTUM_LOOKBACK + 1)]
    expected = (closes[-1] - past_close) / past_close
    assert signal.momentum_pct == pytest.approx(expected)


def test_coin_signal_momentum_pct_is_none_at_exact_lookback_boundary():
    # Exactly MOMENTUM_LOOKBACK candles: len(candles) > momentum_lookback is
    # False, so there is no bar far enough back to compare against.
    candles = _series([100.0 + i for i in range(sig.MOMENTUM_LOOKBACK)])

    signal = sig.coin_signal("BTC", candles, short_period=5, long_period=20, rsi_period=14)

    assert signal.momentum_pct is None


def test_coin_signal_guards_momentum_pct_against_zero_price_lookback_bars_ago():
    # The bar MOMENTUM_LOOKBACK back from the end is priced at 0 — the `if
    # past:` guard must return None instead of raising ZeroDivisionError.
    closes = [0.0] + [100.0 + i for i in range(sig.MOMENTUM_LOOKBACK)]
    candles = _series(closes)

    signal = sig.coin_signal("BTC", candles, short_period=5, long_period=20, rsi_period=14)

    assert signal.momentum_pct is None


def test_portfolio_context_computes_idle_cash_and_concentration():
    ctx = sig.portfolio_context(
        equity=1000.0, cash=250.0, total_return_pct=0.10,
        positions=[("BTC", 600.0), ("ETH", 150.0)],
    )

    assert ctx.idle_cash_pct == pytest.approx(0.25)
    assert ctx.top_symbol == "BTC"
    assert ctx.top_concentration_pct == pytest.approx(0.60)
    assert ctx.holdings_count == 2


def test_portfolio_context_handles_an_all_cash_portfolio():
    ctx = sig.portfolio_context(
        equity=1000.0, cash=1000.0, total_return_pct=0.0, positions=[]
    )

    assert ctx.idle_cash_pct == pytest.approx(1.0)
    assert ctx.top_symbol is None
    assert ctx.top_concentration_pct == 0.0
    assert ctx.holdings_count == 0


def test_portfolio_context_treats_zero_equity_as_no_concentration():
    # A wiped-out portfolio must not divide by zero.
    ctx = sig.portfolio_context(
        equity=0.0, cash=0.0, total_return_pct=-1.0, positions=[]
    )

    assert ctx.idle_cash_pct == 0.0
    assert ctx.top_concentration_pct == 0.0
