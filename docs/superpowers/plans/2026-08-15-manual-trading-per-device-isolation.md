# Per-Device Isolation for Manual Trading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every visitor their own private watchlist and manual ($100k simulated cash) portfolio, instead of every visitor today sharing the exact same global watchlist/portfolio/order history/advice cache.

**Architecture:** Generate a random opaque `device_id` (UUID) client-side on first load, persist it in `localStorage`, and send it as an `X-Device-Id` header on every API request via the app's single `apiFetch` choke point. On the backend, a new required FastAPI dependency extracts that header; `ManualRepository` becomes device-scoped at construction (`ManualRepository(session, device_id)`) instead of operating on one implicit global portfolio, and the `watchlist`/`portfolios` tables gain a `device_id` column (composite primary key for `watchlist`). Everything downstream of `portfolio_id` (orders, equity points, advice cache) is already scoped correctly once the portfolio itself is — no schema change needed there. Lab features (paper sessions, agent runs) and the Leaderboard's ranking of paper sessions stay shared/public by explicit product decision — only the manual "your $100k account" surface becomes private.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (backend), React + Vite + vitest (frontend), pytest against a real Postgres test database (existing `tests/api/conftest.py` fixtures).

---

## Context for the engineer

Read these before starting — they explain *why* the design looks like this, not just *what* to type:

- `src/hedgefund/api/db/manual_repository.py` — the class every task below modifies. Right now every method operates on "the" portfolio/watchlist with zero notion of who's asking.
- `src/hedgefund/api/db/manual_models.py` — `WatchlistRow.symbol` is currently the sole primary key; `PortfolioRow` has no owner column at all.
- `src/hedgefund/manual/portfolio_service.py` — `get_portfolio_view`, `place_order`, `get_equity_series` all call `repo.get_or_create_active_portfolio(...)` internally and take no portfolio/device argument. **This file needs zero changes** — once `repo` itself is device-scoped, these functions automatically resolve the right portfolio. Don't touch it.
- `src/hedgefund/manual/equity_snapshots.py` — a background loop that currently snapshots equity for "the" one active portfolio every `MANUAL_EQUITY_SNAPSHOT_SECONDS`. Once portfolios are per-device, it must fan out across every device that has one.
- `src/hedgefund/api/routes/{watchlist,manual_portfolio,advice,leaderboard}.py` — the only four places that construct `ManualRepository(session)`. `leaderboard.py` is in scope because its "You" row is built from the caller's own manual portfolio — that must become the *viewer's* portfolio, not the global one.
- `dashboard/src/api/client.ts` — every frontend API call funnels through `apiFetch()` here. One change here covers every endpoint.
- `tests/api/conftest.py` — the `client` fixture wraps `fastapi.testclient.TestClient`, which is really an `httpx.Client` subclass and accepts a `headers=` kwarg applied as defaults to every request it makes. Setting a default `X-Device-Id` there means **none of the ~20 existing `client.get/post/...` call sites across the test suite need to change** — only new isolation tests need an explicit second device.
- Paper sessions and agent runs (the "Lab") and the Leaderboard's ranking of those sessions are **explicitly staying shared/public** — this was a deliberate product decision, not an oversight. Do not add device scoping to `paper_repository.py`, `agent_repository.py`, `paper_sessions.py`, or `agent_runs.py`.

---

## Data-loss callout (read before running Task 1)

The migration in Task 1 deletes every existing row in `watchlist`, `portfolios`, `manual_orders`, `portfolio_equity`, and `advice_log`. Those rows represent the single shared demo portfolio that predates per-device isolation — there is no real device to attribute them to, so backfilling is pointless; wiping them is the correct, simplest choice here (not appropriate for a table with real, attributable user data — but that's not what this is). If you've since added other data to those tables that you *do* want to keep, stop and reconsider before running this migration.

---

### Task 1: Database migration — device_id on portfolios, composite PK on watchlist

**Files:**
- Create: `migrations/versions/0008_scope_manual_trading_by_device.py`
- Modify: `src/hedgefund/api/db/manual_models.py`
- Test: `tests/api/test_manual_repository.py` (verifies the new model shape indirectly via Task 3's tests — this task just needs the migration to apply cleanly)

- [ ] **Step 1: Write the migration**

```python
"""scope watchlist and portfolios by device_id

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing rows represent the single shared "everyone's portfolio" bucket
    # that predates per-device isolation. There's no real device to
    # attribute them to, so this clears them rather than guessing — see the
    # data-loss callout in the plan this migration came from. Children of
    # portfolios first, to respect FK constraints.
    op.execute("DELETE FROM advice_log")
    op.execute("DELETE FROM manual_orders")
    op.execute("DELETE FROM portfolio_equity")
    op.execute("DELETE FROM portfolios")
    op.execute("DELETE FROM watchlist")

    op.add_column("portfolios", sa.Column("device_id", sa.String(), nullable=False))
    op.create_index("ix_portfolios_device_id", "portfolios", ["device_id"])

    op.drop_constraint("watchlist_pkey", "watchlist", type_="primary")
    op.add_column("watchlist", sa.Column("device_id", sa.String(), nullable=False))
    op.create_primary_key("watchlist_pkey", "watchlist", ["device_id", "symbol"])


def downgrade() -> None:
    op.drop_constraint("watchlist_pkey", "watchlist", type_="primary")
    op.drop_column("watchlist", "device_id")
    op.create_primary_key("watchlist_pkey", "watchlist", ["symbol"])

    op.drop_index("ix_portfolios_device_id", table_name="portfolios")
    op.drop_column("portfolios", "device_id")
```

- [ ] **Step 2: Update the SQLAlchemy models to match**

In `src/hedgefund/api/db/manual_models.py`, replace the `WatchlistRow` and `PortfolioRow` classes:

```python
class WatchlistRow(Base):
    __tablename__ = "watchlist"

    device_id: Mapped[str] = mapped_column(String, primary_key=True)
    symbol: Mapped[str] = mapped_column(String, primary_key=True)
    starred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PortfolioRow(Base):
    __tablename__ = "portfolios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    starting_cash: Mapped[float] = mapped_column(Float, nullable=False)
    # clock_timestamp() (not now()) so rows created within the same transaction still
    # get strictly increasing values — get_active_portfolio() relies on that ordering.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )
```

(Everything else in the file — `ManualOrderRow`, `PortfolioEquityRow`, `AdviceLogRow` — is unchanged; they're already scoped transitively via `portfolio_id`.)

- [ ] **Step 3: Verify the migration applies cleanly**

Run: `alembic upgrade head` (against your local Postgres — same one `TEST_DATABASE_URL`/`DATABASE_URL` points at)
Expected: no errors; `\d watchlist` in `psql` shows primary key `(device_id, symbol)`; `\d portfolios` shows a `device_id` column and `ix_portfolios_device_id` index.

- [ ] **Step 4: Commit**

```bash
git add migrations/versions/0008_scope_manual_trading_by_device.py src/hedgefund/api/db/manual_models.py
git commit -m "feat(manual): add device_id to watchlist/portfolios schema"
```

---

### Task 2: Device-scope ManualRepository

**Files:**
- Modify: `src/hedgefund/api/db/manual_repository.py`
- Test: `tests/api/test_manual_repository.py`

- [ ] **Step 1: Write the failing tests**

Replace every `ManualRepository(session)` call in `tests/api/test_manual_repository.py` with `ManualRepository(session, "device-a")`, and add two new isolation tests. The full updated file:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/api/test_manual_repository.py -v`
Expected: FAIL — `ManualRepository.__init__() takes 2 positional arguments but 3 were given` (constructor doesn't accept `device_id` yet), plus `AttributeError: type object 'ManualRepository' has no attribute 'list_active_device_ids'`.

- [ ] **Step 3: Implement device-scoping**

Replace the full contents of `src/hedgefund/api/db/manual_repository.py`:

```python
from __future__ import annotations

import uuid
import zlib
from datetime import datetime

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from hedgefund.api.db.manual_models import (
    AdviceLogRow,
    ManualOrderRow,
    PortfolioEquityRow,
    PortfolioRow,
    WatchlistRow,
)

# Namespace for the Postgres transaction-scoped advisory lock that serializes
# concurrent "bootstrap the first portfolio" attempts for the SAME device
# (see get_or_create_active_portfolio below). Scoped per-device (crc32 of
# this namespace + device_id) so two DIFFERENT devices bootstrapping at the
# same moment never serialize against each other — only concurrent requests
# from the same device do, which is the actual scenario this guards against
# (e.g. a browser firing GET /portfolio and GET /portfolio/orders in
# parallel on first load).
_PORTFOLIO_BOOTSTRAP_LOCK_NAMESPACE = "hedgefund.manual.portfolio_bootstrap"


class ManualRepository:
    """Data access for the beginner (manual-trading) surfaces, scoped to one
    device_id. Caller commits."""

    def __init__(self, session: Session, device_id: str) -> None:
        self._s = session
        self._device_id = device_id

    def list_watchlist(self) -> list[str]:
        stmt = (
            select(WatchlistRow)
            .where(WatchlistRow.device_id == self._device_id)
            .order_by(WatchlistRow.starred_at, WatchlistRow.symbol)
        )
        return [row.symbol for row in self._s.scalars(stmt)]

    def star(self, symbol: str) -> None:
        if self._s.get(WatchlistRow, (self._device_id, symbol)) is None:
            self._s.add(WatchlistRow(device_id=self._device_id, symbol=symbol))
            self._s.flush()

    def unstar(self, symbol: str) -> None:
        row = self._s.get(WatchlistRow, (self._device_id, symbol))
        if row is not None:
            self._s.delete(row)
            self._s.flush()

    # ---- portfolios (Phase 3) ----

    def get_active_portfolio(self) -> PortfolioRow | None:
        stmt = (
            select(PortfolioRow)
            .where(PortfolioRow.device_id == self._device_id)
            .order_by(PortfolioRow.created_at.desc())
            .limit(1)
        )
        return self._s.scalars(stmt).first()

    def create_portfolio(self, starting_cash: float) -> PortfolioRow:
        row = PortfolioRow(id=uuid.uuid4(), device_id=self._device_id, starting_cash=starting_cash)
        self._s.add(row)
        self._s.flush()
        return row

    def get_or_create_active_portfolio(self, default_cash: float) -> PortfolioRow:
        # Double-checked locking: the overwhelming majority of calls, forever
        # after the very first request from a given device, find an
        # existing portfolio here and return immediately without ever
        # touching the lock. We only pay the lock's round-trip (and briefly
        # hold it) on the rare path where none exists yet for this device.
        existing = self.get_active_portfolio()
        if existing is not None:
            return existing

        # Serialize concurrent bootstrap attempts from this SAME device.
        # Transaction-scoped: acquired here, released automatically on this
        # session's next commit or rollback — no separate unlock needed.
        #
        # Deliberately NOT held for the rest of the caller's transaction:
        # callers like get_portfolio_view() do further work (up to ~20
        # sequential ccxt calls on a cold market-data cache) before their
        # own commit. Locking only around this recheck-then-create keeps
        # that unrelated work from serializing behind this device's lock
        # once a portfolio already exists.
        lock_key = zlib.crc32(
            f"{_PORTFOLIO_BOOTSTRAP_LOCK_NAMESPACE}.{self._device_id}".encode()
        )
        self._s.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key}
        )
        # Recheck: another caller for this device may have created one while
        # we were blocked waiting for the lock.
        return self.get_active_portfolio() or self.create_portfolio(default_cash)

    @staticmethod
    def list_active_device_ids(session: Session) -> list[str]:
        """Every distinct device_id with at least one portfolio. Used only by
        the background equity-snapshot loop (equity_snapshots.py), which
        must fan out across every device's active portfolio each cycle —
        deliberately NOT device-scoped, unlike every other method here."""
        stmt = select(PortfolioRow.device_id).distinct()
        return list(session.scalars(stmt).all())

    def list_orders(self, portfolio_id: uuid.UUID) -> list[ManualOrderRow]:
        stmt = (
            select(ManualOrderRow)
            .where(ManualOrderRow.portfolio_id == portfolio_id)
            .order_by(ManualOrderRow.created_at)
        )
        return list(self._s.scalars(stmt).all())

    def add_order(
        self, portfolio_id: uuid.UUID, *, symbol: str, side: str,
        usd_amount: float, units: float, fill_price: float,
    ) -> ManualOrderRow:
        row = ManualOrderRow(
            id=uuid.uuid4(), portfolio_id=portfolio_id, symbol=symbol, side=side,
            usd_amount=usd_amount, units=units, fill_price=fill_price,
        )
        self._s.add(row)
        self._s.flush()
        return row

    def add_equity_point(self, portfolio_id: uuid.UUID, ts: datetime, equity: float) -> None:
        self._s.add(PortfolioEquityRow(
            id=uuid.uuid4(), portfolio_id=portfolio_id, ts=ts, equity=equity,
        ))
        self._s.flush()

    def list_equity(
        self, portfolio_id: uuid.UUID, since: datetime | None
    ) -> list[PortfolioEquityRow]:
        stmt = (
            select(PortfolioEquityRow)
            .where(PortfolioEquityRow.portfolio_id == portfolio_id)
            .order_by(PortfolioEquityRow.ts)
        )
        if since is not None:
            stmt = stmt.where(PortfolioEquityRow.ts >= since)
        return list(self._s.scalars(stmt).all())

    # ---- advice cache (Phase 4) ----

    def get_fresh_advice(
        self, portfolio_id: uuid.UUID, *, scope: str, not_before: datetime
    ) -> AdviceLogRow | None:
        """Newest advice row for this (portfolio, scope) generated at or after
        `not_before`. The TTL lives in the service layer, which computes the
        cutoff — the repository only answers 'is there one this recent'."""
        stmt = (
            select(AdviceLogRow)
            .where(
                AdviceLogRow.portfolio_id == portfolio_id,
                AdviceLogRow.scope == scope,
                AdviceLogRow.generated_at >= not_before,
            )
            .order_by(AdviceLogRow.generated_at.desc())
            .limit(1)
        )
        return self._s.scalars(stmt).first()

    def add_advice(
        self, portfolio_id: uuid.UUID, *, scope: str, payload: dict
    ) -> AdviceLogRow:
        row = AdviceLogRow(
            id=uuid.uuid4(), portfolio_id=portfolio_id, scope=scope, payload=payload
        )
        self._s.add(row)
        self._s.flush()
        return row

    def clear_advice(self, portfolio_id: uuid.UUID) -> int:
        """Drop every cached scope for this portfolio. Called when an order
        fills — a new position invalidates portfolio-wide *and* per-coin advice.
        Returns the number of rows removed."""
        result = self._s.execute(
            delete(AdviceLogRow).where(AdviceLogRow.portfolio_id == portfolio_id)
        )
        self._s.flush()
        return result.rowcount
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/api/test_manual_repository.py -v`
Expected: PASS — all tests including the two new isolation tests and `test_list_active_device_ids_returns_one_per_device`.

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/db/manual_repository.py tests/api/test_manual_repository.py
git commit -m "feat(manual): device-scope ManualRepository"
```

---

### Task 3: Add the X-Device-Id dependency and wire it through routes

**Files:**
- Modify: `src/hedgefund/api/deps.py`
- Modify: `src/hedgefund/api/routes/watchlist.py`
- Modify: `src/hedgefund/api/routes/manual_portfolio.py`
- Modify: `src/hedgefund/api/routes/advice.py`
- Modify: `src/hedgefund/api/routes/leaderboard.py`
- Modify: `tests/api/conftest.py`
- Modify: `tests/api/test_watchlist_routes.py`
- Modify: `tests/api/test_manual_portfolio_routes.py`

- [ ] **Step 1: Write the failing tests**

Give the shared `client` fixture a default device header (so every existing call site keeps working unchanged), and add tests proving the header is required and that two devices don't see each other's data.

In `tests/api/conftest.py`, change only the last line of the `client` fixture:

```python
    with TestClient(app, headers={"X-Device-Id": "test-device"}) as c:
        yield c
```

(everything else in that fixture is unchanged — this is the only line that differs from the current file.)

Append to `tests/api/test_watchlist_routes.py`:

```python
def test_watchlist_requires_device_id_header(client):
    res = client.get("/watchlist", headers={"X-Device-Id": ""})
    assert res.status_code == 400


def test_watchlist_is_isolated_per_device(client):
    client.put("/watchlist/BTC")  # uses the fixture's default "test-device"
    other = client.get("/watchlist", headers={"X-Device-Id": "other-device"})
    assert other.json() == {"symbols": []}
```

Append to `tests/api/test_manual_portfolio_routes.py`:

```python
def test_portfolio_is_isolated_per_device(client):
    client.post("/portfolio/orders",
                json={"symbol": "AAA", "side": "buy", "usd_amount": 1000.0})
    other = client.get("/portfolio", headers={"X-Device-Id": "other-device"})
    # A different device bootstraps its own fresh $100k portfolio, unaffected
    # by "test-device"'s trade.
    assert other.json()["cash"] == 100_000.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/api/test_watchlist_routes.py tests/api/test_manual_portfolio_routes.py -v`
Expected: FAIL — routes don't require or use the header yet, so `test_watchlist_requires_device_id_header` gets 200 instead of 400, and the isolation tests see shared state instead of isolated state. (The rest of the suite in these two files still passes at this point, since the fixture default header is harmless until routes start requiring it.)

- [ ] **Step 3: Add the dependency**

In `src/hedgefund/api/deps.py`, add the import and function:

```python
from fastapi import Header, HTTPException
```

(add alongside the existing imports at the top of the file)

```python
def get_device_id(x_device_id: str | None = Header(default=None, alias="X-Device-Id")) -> str:
    """Required per-request device identity for the manual-trading surfaces
    (watchlist/portfolio/advice). The frontend generates and persists a
    random UUID in localStorage (dashboard/src/lib/deviceId.ts) and sends it
    on every request — this keeps each visitor's simulated portfolio
    private without requiring login. Not a security credential: anyone who
    guesses another device's ID could act as that device. That's an
    accepted tradeoff for a login-free play-money simulator, not a defect.
    """
    if not x_device_id:
        raise HTTPException(status_code=400, detail="X-Device-Id header is required.")
    return x_device_id
```

- [ ] **Step 4: Wire it through the four routes**

In `src/hedgefund/api/routes/watchlist.py`, add the import and thread `device_id` through all three endpoints:

```python
from hedgefund.api.deps import get_device_id
```

```python
@router.get("", response_model=WatchlistResponse)
def get_watchlist(
    session: Session = Depends(get_session), device_id: str = Depends(get_device_id)
) -> WatchlistResponse:
    return WatchlistResponse(symbols=ManualRepository(session, device_id).list_watchlist())


@router.put("/{symbol}", response_model=WatchlistResponse)
def star(
    symbol: str,
    session: Session = Depends(get_session),
    device_id: str = Depends(get_device_id),
) -> WatchlistResponse:
    symbol = symbol.upper()
    if symbol not in _BASE_SYMBOLS:
        raise HTTPException(status_code=422, detail="Unknown coin.")
    repo = ManualRepository(session, device_id)
    repo.star(symbol)
    session.commit()
    return WatchlistResponse(symbols=repo.list_watchlist())


@router.delete("/{symbol}", response_model=WatchlistResponse)
def unstar(
    symbol: str,
    session: Session = Depends(get_session),
    device_id: str = Depends(get_device_id),
) -> WatchlistResponse:
    repo = ManualRepository(session, device_id)
    repo.unstar(symbol.upper())
    session.commit()
    return WatchlistResponse(symbols=repo.list_watchlist())
```

In `src/hedgefund/api/routes/manual_portfolio.py`, add the import and thread `device_id` through all five endpoints (each one just adds `device_id: str = Depends(get_device_id)` to its signature and passes it as the second arg to `ManualRepository(...)`):

```python
from hedgefund.api.deps import get_device_id, get_market_data
```

```python
@router.get("", response_model=PortfolioResponse)
def get_portfolio(
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
    device_id: str = Depends(get_device_id),
) -> PortfolioResponse:
    repo = ManualRepository(session, device_id)
    try:
        view = get_portfolio_view(repo, market)
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    session.commit()  # first call may create the bootstrap portfolio row
    return PortfolioResponse.model_validate(view)


@router.get("/orders", response_model=list[ManualOrderOut])
def list_orders(
    session: Session = Depends(get_session), device_id: str = Depends(get_device_id)
) -> list[ManualOrderOut]:
    repo = ManualRepository(session, device_id)
    portfolio = repo.get_or_create_active_portfolio(DEFAULT_STARTING_CASH)
    session.commit()
    rows = repo.list_orders(portfolio.id)
    return [ManualOrderOut.model_validate(row) for row in reversed(rows)]


@router.post("/orders", response_model=ManualOrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    body: PlaceOrderRequest,
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
    device_id: str = Depends(get_device_id),
) -> ManualOrderOut:
    repo = ManualRepository(session, device_id)
    try:
        row = place_order(
            repo, market,
            symbol=body.symbol.upper(), side=body.side, usd_amount=body.usd_amount,
        )
    except OrderValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except UnknownSymbolError:
        raise HTTPException(status_code=404, detail="Unknown coin.")
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    session.commit()
    session.refresh(row)
    return ManualOrderOut.model_validate(row)


@router.get("/equity", response_model=EquitySeriesResponse)
def equity_series(
    range: str = Query("1M"),
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
    device_id: str = Depends(get_device_id),
) -> EquitySeriesResponse:
    if range not in EQUITY_RANGE_DAYS:
        raise HTTPException(
            status_code=422, detail=f"range must be one of {sorted(EQUITY_RANGE_DAYS)}"
        )
    repo = ManualRepository(session, device_id)
    try:
        points = get_equity_series(repo, market, range)
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    session.commit()
    return EquitySeriesResponse(
        range=range,
        points=[EquityPointOut(ts=ts, equity=equity) for ts, equity in points],
    )


@router.post("/reset", response_model=PortfolioCreatedResponse,
             status_code=status.HTTP_201_CREATED)
def reset_portfolio(
    body: ResetPortfolioRequest,
    session: Session = Depends(get_session),
    device_id: str = Depends(get_device_id),
) -> PortfolioCreatedResponse:
    repo = ManualRepository(session, device_id)
    row = repo.create_portfolio(starting_cash=body.starting_cash)
    session.commit()
    session.refresh(row)
    return PortfolioCreatedResponse.model_validate(row)
```

In `src/hedgefund/api/routes/advice.py`, add the import and thread `device_id` through both endpoints:

```python
from hedgefund.api.deps import get_call_llm, get_device_id, get_market_data
```

```python
@router.get("", response_model=AdviceResponse)
def read_advice(
    symbol: str | None = Query(None),
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
    device_id: str = Depends(get_device_id),
) -> AdviceResponse:
    """Cached advice only — deliberately never calls the LLM, so simply opening
    the Dashboard costs nothing."""
    if not get_settings().advisor_enabled:
        return _disabled()

    scope = _scope_for(symbol, market)
    repo = ManualRepository(session, device_id)
    portfolio = repo.get_or_create_active_portfolio(DEFAULT_STARTING_CASH)
    session.commit()

    payload = adv.read_cached_advice(repo, portfolio.id, scope=scope)
    return AdviceResponse(
        enabled=True,
        advice=None if payload is None else AdvicePayloadOut.model_validate(payload),
    )


@router.post("", response_model=AdviceResponse, status_code=status.HTTP_201_CREATED)
def create_advice(
    response: Response,
    symbol: str | None = Query(None),
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
    call_llm=Depends(get_call_llm),
    device_id: str = Depends(get_device_id),
) -> AdviceResponse:
    """Generate advice on demand. Reuses a fresh cache entry if one exists."""
    if not get_settings().advisor_enabled:
        # Not an error: the client asked for something the operator turned off.
        response.status_code = status.HTTP_200_OK
        return _disabled()

    scope = _scope_for(symbol, market)
    repo = ManualRepository(session, device_id)
    try:
        view = get_portfolio_view(repo, market)
        payload = adv.generate_advice(repo, market, call_llm, view=view, scope=scope)
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    except UnknownSymbolError:
        raise HTTPException(status_code=404, detail="Unknown coin.")
    session.commit()
    return AdviceResponse(enabled=True, advice=AdvicePayloadOut.model_validate(payload))
```

In `src/hedgefund/api/routes/leaderboard.py`, add the import and thread `device_id` through so the "You" row reflects the viewer's own portfolio:

```python
from hedgefund.api.deps import get_device_id, get_market_data
```

```python
@router.get("", response_model=LeaderboardResponse)
def get_leaderboard(
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
    device_id: str = Depends(get_device_id),
) -> LeaderboardResponse:
    manual = ManualRepository(session, device_id)
    paper = PaperRepository(session)
    # (rest of the function body is unchanged)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/api/ -v`
Expected: PASS — the full `tests/api/` suite, including the new device-id tests. (This also re-exercises every pre-existing test in `test_watchlist_routes.py` / `test_manual_portfolio_routes.py` / `test_advice_routes.py` (if it exists) / `test_leaderboard_routes.py` (if it exists) unchanged, proving the fixture's default header is sufficient for them.)

- [ ] **Step 6: Commit**

```bash
git add src/hedgefund/api/deps.py src/hedgefund/api/routes/watchlist.py \
        src/hedgefund/api/routes/manual_portfolio.py src/hedgefund/api/routes/advice.py \
        src/hedgefund/api/routes/leaderboard.py tests/api/conftest.py \
        tests/api/test_watchlist_routes.py tests/api/test_manual_portfolio_routes.py
git commit -m "feat(manual): require X-Device-Id and thread it through manual-trading routes"
```

---

### Task 4: Fan out the background equity-snapshot loop across devices

**Files:**
- Modify: `src/hedgefund/manual/equity_snapshots.py`

`snapshot_once()` itself needs **no changes** — it already just calls `repo.get_active_portfolio()`/`get_portfolio_view(repo, market)`, and those now resolve correctly once `repo` is device-scoped. Only the loop that constructs `repo` needs to change, from "one repo, one implicit portfolio" to "one repo per known device, each cycle."

- [ ] **Step 1: Update the loop**

Replace `equity_snapshot_loop` in `src/hedgefund/manual/equity_snapshots.py` (everything above it — the `snapshot_once` function — is unchanged):

```python
async def equity_snapshot_loop(
    session_factory, market: MarketDataProvider, interval_seconds: int
) -> None:
    """Background loop mirroring paper.ticker_loop: sync DB + ccxt work runs in
    a worker thread; the loop never dies. Fans out across every device that
    has a portfolio — there is no longer a single implicit "active"
    portfolio for the whole app."""
    from hedgefund.api.db.manual_repository import ManualRepository

    while True:
        def _cycle() -> None:
            db = session_factory()
            try:
                for device_id in ManualRepository.list_active_device_ids(db):
                    snapshot_once(ManualRepository(db, device_id), market)
                db.commit()
            finally:
                db.close()

        try:
            await asyncio.to_thread(_cycle)
        except Exception:  # noqa: BLE001 - never let the loop die
            logger.exception("equity snapshot cycle crashed; continuing")
        await asyncio.sleep(interval_seconds)
```

- [ ] **Step 2: Run the existing snapshot tests to confirm no regression**

Run: `pytest tests/manual/test_equity_snapshots.py -v`
Expected: PASS — unchanged, since `snapshot_once`'s signature and behavior didn't change.

- [ ] **Step 3: Commit**

```bash
git add src/hedgefund/manual/equity_snapshots.py
git commit -m "feat(manual): fan the equity-snapshot loop out across all devices"
```

---

### Task 5: Frontend device-id utility

**Files:**
- Create: `dashboard/src/lib/deviceId.ts`
- Test: `dashboard/src/lib/deviceId.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDeviceId } from './deviceId'

describe('getDeviceId', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('generates and persists an id on first call', () => {
    const id = getDeviceId()
    expect(id).toBeTruthy()
    expect(localStorage.getItem('hedgefund-device-id')).toBe(id)
  })

  it('returns the same id on subsequent calls', () => {
    const first = getDeviceId()
    const second = getDeviceId()
    expect(second).toBe(first)
  })

  it('reuses an id already in localStorage instead of generating a new one', () => {
    localStorage.setItem('hedgefund-device-id', 'existing-id')
    expect(getDeviceId()).toBe('existing-id')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/deviceId.test.ts` (from `dashboard/`)
Expected: FAIL with "Cannot find module './deviceId'"

- [ ] **Step 3: Write the implementation**

```typescript
const STORAGE_KEY = 'hedgefund-device-id'

/**
 * A random, opaque per-browser identity — not an auth credential — used to
 * keep each visitor's manual-trading portfolio/watchlist private without
 * requiring login. Generated once and persisted in localStorage; sent as
 * the X-Device-Id header on every API request (see api/client.ts).
 */
export function getDeviceId(): string {
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing) return existing

  const id = crypto.randomUUID()
  localStorage.setItem(STORAGE_KEY, id)
  return id
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/deviceId.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/deviceId.ts dashboard/src/lib/deviceId.test.ts
git commit -m "feat(manual): add per-browser device id utility"
```

---

### Task 6: Send the device id on every API request

**Files:**
- Modify: `dashboard/src/api/client.ts`
- Modify: `dashboard/src/api/client.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `dashboard/src/api/client.test.ts` (keep the three existing tests as-is):

```typescript
  it('sends the device id as a header on every request', async () => {
    localStorage.clear()
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/watchlist')

    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('X-Device-Id')).toBeTruthy()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/api/client.test.ts` (from `dashboard/`)
Expected: FAIL — `headers.get('X-Device-Id')` is `null`, `apiFetch` doesn't send it yet.

- [ ] **Step 3: Implement**

Replace `dashboard/src/api/client.ts`:

```typescript
import { API_BASE_URL } from './config'
import { getDeviceId } from '../lib/deviceId'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('X-Device-Id', getDeviceId())

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/api/client.test.ts`
Expected: PASS — all four tests (three pre-existing + the new one).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/api/client.ts dashboard/src/api/client.test.ts
git commit -m "feat(manual): send X-Device-Id on every API request"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `pytest -v` (from repo root)
Expected: PASS — every test, including `tests/api/`, `tests/manual/`, and everything else untouched by this plan (paper sessions, agent runs, backtests, leaderboard's paper-session rows).

- [ ] **Step 2: Run the full frontend test suite**

Run: `npm run test` (from `dashboard/`)
Expected: PASS — all existing + new tests (309 + the ~4 new ones from Tasks 5–6).

- [ ] **Step 3: Run the frontend build**

Run: `npm run build` (from `dashboard/`)
Expected: succeeds with no type errors (device_id plumbing is fully typed).

- [ ] **Step 4: Manual smoke test against a local Postgres**

Run: `alembic upgrade head`, then start the backend (`uvicorn hedgefund.api.app:app --reload`) and the frontend (`npm run dev`).
- Open the dashboard in two different browsers (or one normal + one incognito window, so `localStorage` doesn't share) — star different coins and place different orders in each. Confirm each shows only its own watchlist/portfolio.
- Confirm the Leaderboard's "You" row matches whichever browser you're viewing it from.

- [ ] **Step 5: Commit** (only if Step 4 turned up fixes — otherwise nothing to commit)

---

## Self-review

**Spec coverage:** watchlist/portfolio/orders/equity/advice all scoped via `portfolio_id` → `device_id` chain (Tasks 1–3); leaderboard's "You" row uses the viewer's own portfolio (Task 3); background equity snapshots fan out per device instead of assuming one global portfolio (Task 4); frontend generates/persists/sends the device id (Tasks 5–6); paper sessions/agent runs/Lab leaderboard rows explicitly untouched per the product decision. No gaps found.

**Placeholder scan:** every step has complete, runnable code — no TODOs or "add validation here" left in.

**Type consistency:** `ManualRepository(session, device_id)` constructor shape is identical across Tasks 2–4; `get_device_id` / `X-Device-Id` naming is consistent across backend deps, routes, and the frontend header; `list_active_device_ids` is used with that exact name in both the repository (Task 2) and the snapshot loop (Task 4).
