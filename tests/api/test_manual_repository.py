from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import sessionmaker

from hedgefund.api.db.manual_models import PortfolioRow
from hedgefund.api.db.manual_repository import ManualRepository


def test_watchlist_star_list_unstar(session):
    repo = ManualRepository(session, "device-a")
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


def test_watchlist_is_isolated_per_device(session):
    repo_a = ManualRepository(session, "device-a")
    repo_b = ManualRepository(session, "device-b")

    repo_a.star("BTC")
    repo_b.star("ETH")

    assert repo_a.list_watchlist() == ["BTC"]
    assert repo_b.list_watchlist() == ["ETH"]


def test_portfolio_bootstrap_and_active_selection(session):
    repo = ManualRepository(session, "device-a")
    assert repo.get_active_portfolio() is None

    first = repo.get_or_create_active_portfolio(default_cash=100_000.0)
    assert first.starting_cash == 100_000.0
    assert repo.get_or_create_active_portfolio(default_cash=1.0).id == first.id

    second = repo.create_portfolio(starting_cash=50_000.0)
    assert repo.get_active_portfolio().id == second.id  # newest row wins


def test_portfolio_is_isolated_per_device(session):
    repo_a = ManualRepository(session, "device-a")
    repo_b = ManualRepository(session, "device-b")

    portfolio_a = repo_a.get_or_create_active_portfolio(default_cash=100_000.0)
    portfolio_b = repo_b.get_or_create_active_portfolio(default_cash=50_000.0)

    assert portfolio_a.id != portfolio_b.id
    assert repo_a.get_active_portfolio().id == portfolio_a.id
    assert repo_b.get_active_portfolio().id == portfolio_b.id


def test_list_active_device_ids_returns_one_per_device(session):
    ManualRepository(session, "device-a").get_or_create_active_portfolio(default_cash=100_000.0)
    ManualRepository(session, "device-b").get_or_create_active_portfolio(default_cash=100_000.0)
    # device-a resets — should still count once, not twice.
    ManualRepository(session, "device-a").create_portfolio(starting_cash=50_000.0)

    device_ids = ManualRepository.list_active_device_ids(session)
    assert sorted(device_ids) == ["device-a", "device-b"]


def test_bootstrap_serializes_concurrent_callers_via_advisory_lock(engine):
    """Two callers race to bootstrap the first portfolio on an empty table —
    e.g. a browser firing GET /portfolio and GET /portfolio/orders in
    parallel on first load. Without the advisory lock in
    get_or_create_active_portfolio, both could see "no active portfolio" and
    each create one, silently orphaning the loser.

    This is deliberately NOT a wall-clock race between two threads hoping to
    hit a narrow timing window (that approach was tried and found unreliable
    in this environment: a fast local Postgres round-trip meant the first
    caller's SELECT-then-INSERT-then-commit routinely completed before the
    second caller's SELECT even ran, so the "race" never actually raced).
    Instead, caller A bootstraps but deliberately withholds its commit, which
    means it is still holding the transaction-scoped advisory lock. Caller B
    is then started on a second thread and must DETERMINISTICALLY block
    inside its own get_or_create_active_portfolio call — not probabilistically,
    since pg_advisory_xact_lock blocks for as long as the lock is held,
    however long that is — until A commits and releases it. That blocking
    behavior is exactly the guarantee the fix relies on.

    Both callers use the SAME device_id here: the lock key is now derived
    per-device (see Task 2 Step 3), so this test would pass trivially for
    granted for two DIFFERENT devices — it specifically proves same-device
    concurrent bootstraps still serialize correctly.
    """
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session_a = Session()
    session_b = Session()
    repo_a = ManualRepository(session_a, "device-a")
    repo_b = ManualRepository(session_b, "device-a")

    b_done = threading.Event()
    portfolio_b_ids = []

    def call_b() -> None:
        portfolio_b = repo_b.get_or_create_active_portfolio(default_cash=100_000.0)
        portfolio_b_ids.append(portfolio_b.id)
        b_done.set()

    try:
        # A bootstraps first but does NOT commit yet — its transaction is
        # still open, so it's still holding the advisory lock.
        portfolio_a = repo_a.get_or_create_active_portfolio(default_cash=100_000.0)

        thread_b = threading.Thread(target=call_b)
        thread_b.start()

        # B must still be blocked inside the lock acquisition while A's
        # transaction is open — this is deterministic Postgres locking
        # behavior, not a timing race.
        assert not b_done.wait(timeout=1), (
            "a second caller bootstrapped a portfolio while the first "
            "caller's transaction (holding the lock) was still open — the "
            "advisory lock is not actually serializing bootstrap attempts"
        )

        session_a.commit()  # releases A's transaction-scoped advisory lock

        assert b_done.wait(timeout=5), (
            "second caller never completed after the first released the lock"
        )
        thread_b.join(timeout=5)
        session_b.commit()

        assert portfolio_b_ids[0] == portfolio_a.id, (
            "both callers must converge on the same bootstrapped portfolio, "
            "not create two separate orphaned rows"
        )
        with Session() as verify:
            remaining = verify.execute(select(PortfolioRow.id)).scalars().all()
        assert len(remaining) == 1, "exactly one portfolio row should exist"
    finally:
        session_a.close()
        session_b.close()
        # This test commits on raw `engine` connections outside the
        # rollback-per-test `session` fixture, so it must clean up after
        # itself to avoid leaking a portfolio row into later tests.
        with Session() as cleanup:
            cleanup.execute(delete(PortfolioRow))
            cleanup.commit()


def test_orders_roundtrip(session):
    repo = ManualRepository(session, "device-a")
    p = repo.get_or_create_active_portfolio(default_cash=100_000.0)
    repo.add_order(p.id, symbol="BTC", side="buy", usd_amount=1000.0,
                   units=10.0, fill_price=100.0)
    repo.add_order(p.id, symbol="BTC", side="sell", usd_amount=500.0,
                   units=5.0, fill_price=100.0)
    orders = repo.list_orders(p.id)
    assert [o.side for o in orders] == ["buy", "sell"]  # oldest first
    assert orders[0].units == 10.0


def test_equity_points_filtered_by_since(session):
    repo = ManualRepository(session, "device-a")
    p = repo.get_or_create_active_portfolio(default_cash=100_000.0)
    now = datetime.now(timezone.utc)
    repo.add_equity_point(p.id, now - timedelta(days=10), 99_000.0)
    repo.add_equity_point(p.id, now - timedelta(days=1), 101_000.0)
    assert len(repo.list_equity(p.id, since=None)) == 2
    recent = repo.list_equity(p.id, since=now - timedelta(days=5))
    assert len(recent) == 1
    assert recent[0].equity == 101_000.0


def test_add_and_get_fresh_advice_round_trips_payload(session):
    repo = ManualRepository(session, "device-a")
    portfolio = repo.create_portfolio(100_000.0)
    payload = {"suggestions": [{"text": "hi", "why": "because", "action": None}]}

    repo.add_advice(portfolio.id, scope="portfolio", payload=payload)

    row = repo.get_fresh_advice(
        portfolio.id, scope="portfolio",
        not_before=datetime(2000, 1, 1, tzinfo=timezone.utc),
    )
    assert row is not None
    assert row.payload == payload


def test_get_fresh_advice_ignores_rows_older_than_cutoff(session):
    repo = ManualRepository(session, "device-a")
    portfolio = repo.create_portfolio(100_000.0)
    repo.add_advice(portfolio.id, scope="portfolio", payload={"suggestions": []})

    future = datetime.now(timezone.utc) + timedelta(minutes=5)
    assert repo.get_fresh_advice(portfolio.id, scope="portfolio", not_before=future) is None


def test_get_fresh_advice_is_scoped_per_symbol(session):
    repo = ManualRepository(session, "device-a")
    portfolio = repo.create_portfolio(100_000.0)
    repo.add_advice(portfolio.id, scope="BTC", payload={"suggestions": [], "s": "btc"})

    cutoff = datetime(2000, 1, 1, tzinfo=timezone.utc)
    assert repo.get_fresh_advice(portfolio.id, scope="BTC", not_before=cutoff) is not None
    assert repo.get_fresh_advice(portfolio.id, scope="ETH", not_before=cutoff) is None


def test_get_fresh_advice_returns_newest_row_for_scope(session):
    repo = ManualRepository(session, "device-a")
    portfolio = repo.create_portfolio(100_000.0)
    repo.add_advice(portfolio.id, scope="portfolio", payload={"n": 1})
    repo.add_advice(portfolio.id, scope="portfolio", payload={"n": 2})

    row = repo.get_fresh_advice(
        portfolio.id, scope="portfolio",
        not_before=datetime(2000, 1, 1, tzinfo=timezone.utc),
    )
    assert row.payload == {"n": 2}


def test_clear_advice_removes_every_scope_for_the_portfolio(session):
    repo = ManualRepository(session, "device-a")
    portfolio = repo.create_portfolio(100_000.0)
    repo.add_advice(portfolio.id, scope="portfolio", payload={})
    repo.add_advice(portfolio.id, scope="BTC", payload={})

    removed = repo.clear_advice(portfolio.id)

    cutoff = datetime(2000, 1, 1, tzinfo=timezone.utc)
    assert removed == 2
    assert repo.get_fresh_advice(portfolio.id, scope="portfolio", not_before=cutoff) is None
    assert repo.get_fresh_advice(portfolio.id, scope="BTC", not_before=cutoff) is None
