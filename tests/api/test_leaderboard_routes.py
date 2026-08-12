from __future__ import annotations

from datetime import datetime, timezone


def test_leaderboard_includes_your_portfolio(client):
    response = client.get("/leaderboard")

    assert response.status_code == 200
    labels = [row["label"] for row in response.json()["rows"]]
    assert "You" in labels


def test_your_row_is_marked_with_the_you_kind(client):
    rows = client.get("/leaderboard").json()["rows"]

    you = next(r for r in rows if r["label"] == "You")
    assert you["kind"] == "you"


def test_leaderboard_includes_a_buy_and_hold_btc_benchmark(client):
    rows = client.get("/leaderboard").json()["rows"]

    benchmark = next(r for r in rows if r["kind"] == "benchmark")
    assert "BTC" in benchmark["label"]


def test_leaderboard_includes_each_paper_session(client, session):
    from hedgefund.api.db.paper_repository import PaperRepository

    repo = PaperRepository(session)
    row = repo.create_session(
        label="Momentum v1", spec_json={}, source_backtest_id=None,
        universe=["BTC/USDT"], timeframe="1h", starting_cash=10_000.0, state_json={},
    )
    session.commit()
    repo.record_tick(
        session_id=row.id, ts=datetime(2026, 8, 1, tzinfo=timezone.utc),
        equity=12_000.0, state_json={}, fills=[], is_catchup=False,
    )
    session.commit()

    rows = client.get("/leaderboard").json()["rows"]

    assert any(r["label"] == "Momentum v1" and r["kind"] == "ai" for r in rows)


def test_rows_are_sorted_by_return_descending(client):
    rows = client.get("/leaderboard").json()["rows"]

    returns = [r["total_return_pct"] for r in rows]
    assert returns == sorted(returns, reverse=True)


def test_every_row_carries_a_start_date_and_sparkline(client):
    rows = client.get("/leaderboard").json()["rows"]

    for row in rows:
        assert row["start_date"]
        assert isinstance(row["sparkline"], list)


def test_leaderboard_returns_503_when_prices_are_unavailable(client, market_data):
    market_data.unavailable = True

    assert client.get("/leaderboard").status_code == 503
