from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from hedgefund.manual import leaderboard as lb


def _points(values: list[float], start: datetime | None = None):
    base = start or datetime(2026, 8, 1, tzinfo=timezone.utc)
    return [(base + timedelta(hours=i), v) for i, v in enumerate(values)]


def test_row_from_series_computes_total_return():
    row = lb.row_from_series("You", _points([100.0, 110.0, 120.0]), starting_cash=100.0)

    assert row.total_return_pct == pytest.approx(0.20)


def test_row_from_series_handles_a_loss():
    row = lb.row_from_series("You", _points([100.0, 80.0]), starting_cash=100.0)

    assert row.total_return_pct == pytest.approx(-0.20)


def test_row_from_series_uses_starting_cash_not_the_first_point():
    # Snapshots may begin after some trading already moved the balance.
    row = lb.row_from_series("You", _points([150.0, 200.0]), starting_cash=100.0)

    assert row.total_return_pct == pytest.approx(1.0)


def test_row_from_series_reports_the_first_timestamp_as_the_start_date():
    start = datetime(2026, 7, 1, tzinfo=timezone.utc)

    row = lb.row_from_series("You", _points([100.0, 110.0], start=start), starting_cash=100.0)

    assert row.start_date == start


def test_row_from_series_returns_none_for_an_empty_series():
    assert lb.row_from_series("You", [], starting_cash=100.0) is None


def test_row_from_series_treats_zero_starting_cash_as_zero_return():
    row = lb.row_from_series("You", _points([0.0, 5.0]), starting_cash=0.0)

    assert row.total_return_pct == 0.0


def test_row_from_series_downsamples_the_sparkline():
    row = lb.row_from_series(
        "You", _points([float(i) for i in range(500)]), starting_cash=1.0
    )

    assert len(row.sparkline) <= lb.SPARKLINE_POINTS


def test_sparkline_keeps_the_first_and_last_values():
    row = lb.row_from_series(
        "You", _points([float(i) for i in range(500)]), starting_cash=1.0
    )

    assert row.sparkline[0] == 0.0
    assert row.sparkline[-1] == 499.0


def test_short_series_is_not_padded():
    row = lb.row_from_series("You", _points([1.0, 2.0, 3.0]), starting_cash=1.0)

    assert row.sparkline == (1.0, 2.0, 3.0)


# ---- buy-and-hold benchmark ----

def test_benchmark_series_buys_at_the_first_close_and_marks_to_market():
    closes = [(datetime(2026, 8, 1, tzinfo=timezone.utc), 100.0),
              (datetime(2026, 8, 2, tzinfo=timezone.utc), 150.0)]

    series = lb.buy_and_hold_series(closes, starting_cash=1_000.0)

    assert series[0][1] == pytest.approx(1_000.0)
    assert series[-1][1] == pytest.approx(1_500.0)


def test_benchmark_series_is_empty_when_there_are_no_closes():
    assert lb.buy_and_hold_series([], starting_cash=1_000.0) == []


def test_benchmark_series_is_empty_when_the_first_close_is_zero():
    closes = [(datetime(2026, 8, 1, tzinfo=timezone.utc), 0.0)]

    assert lb.buy_and_hold_series(closes, starting_cash=1_000.0) == []


def test_benchmark_series_starts_at_the_portfolio_start_date():
    closes = [
        (datetime(2026, 7, 1, tzinfo=timezone.utc), 50.0),
        (datetime(2026, 8, 1, tzinfo=timezone.utc), 100.0),
        (datetime(2026, 8, 2, tzinfo=timezone.utc), 200.0),
    ]

    series = lb.buy_and_hold_series(
        closes, starting_cash=1_000.0, since=datetime(2026, 8, 1, tzinfo=timezone.utc)
    )

    # Entry is the 8/1 close of 100, so the 8/2 doubling is a 2x, not a 4x.
    assert len(series) == 2
    assert series[-1][1] == pytest.approx(2_000.0)


def test_benchmark_series_is_empty_when_since_is_after_every_close():
    closes = [(datetime(2026, 7, 1, tzinfo=timezone.utc), 50.0)]

    series = lb.buy_and_hold_series(
        closes, starting_cash=1_000.0, since=datetime(2026, 8, 1, tzinfo=timezone.utc)
    )

    assert series == []


# ---- ordering ----

def test_rank_rows_sorts_by_return_descending():
    rows = [
        lb.row_from_series("A", _points([100.0, 105.0]), starting_cash=100.0),
        lb.row_from_series("B", _points([100.0, 130.0]), starting_cash=100.0),
        lb.row_from_series("C", _points([100.0, 90.0]), starting_cash=100.0),
    ]

    ranked = lb.rank_rows(rows)

    assert [r.label for r in ranked] == ["B", "A", "C"]


def test_rank_rows_drops_nones():
    rows = [lb.row_from_series("A", _points([100.0, 105.0]), starting_cash=100.0), None]

    assert len(lb.rank_rows(rows)) == 1
