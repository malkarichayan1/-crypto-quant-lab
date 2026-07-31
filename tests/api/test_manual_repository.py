from __future__ import annotations

from datetime import datetime, timedelta, timezone

from hedgefund.api.db.manual_repository import ManualRepository


def test_watchlist_star_list_unstar(session):
    repo = ManualRepository(session)
    assert repo.list_watchlist() == []

    repo.star("BTC")
    repo.star("ETH")
    assert repo.list_watchlist() == ["BTC", "ETH"]

    repo.star("BTC")  # idempotent
    assert repo.list_watchlist() == ["BTC", "ETH"]

    repo.unstar("BTC")
    assert repo.list_watchlist() == ["ETH"]

    repo.unstar("BTC")  # idempotent
    assert repo.list_watchlist() == ["ETH"]


def test_portfolio_bootstrap_and_active_selection(session):
    repo = ManualRepository(session)
    assert repo.get_active_portfolio() is None

    first = repo.get_or_create_active_portfolio(default_cash=100_000.0)
    assert first.starting_cash == 100_000.0
    assert repo.get_or_create_active_portfolio(default_cash=1.0).id == first.id

    second = repo.create_portfolio(starting_cash=50_000.0)
    assert repo.get_active_portfolio().id == second.id  # newest row wins


def test_orders_roundtrip(session):
    repo = ManualRepository(session)
    p = repo.get_or_create_active_portfolio(default_cash=100_000.0)
    repo.add_order(p.id, symbol="BTC", side="buy", usd_amount=1000.0,
                   units=10.0, fill_price=100.0)
    repo.add_order(p.id, symbol="BTC", side="sell", usd_amount=500.0,
                   units=5.0, fill_price=100.0)
    orders = repo.list_orders(p.id)
    assert [o.side for o in orders] == ["buy", "sell"]  # oldest first
    assert orders[0].units == 10.0


def test_equity_points_filtered_by_since(session):
    repo = ManualRepository(session)
    p = repo.get_or_create_active_portfolio(default_cash=100_000.0)
    now = datetime.now(timezone.utc)
    repo.add_equity_point(p.id, now - timedelta(days=10), 99_000.0)
    repo.add_equity_point(p.id, now - timedelta(days=1), 101_000.0)
    assert len(repo.list_equity(p.id, since=None)) == 2
    recent = repo.list_equity(p.id, since=now - timedelta(days=5))
    assert len(recent) == 1
    assert recent[0].equity == 101_000.0
