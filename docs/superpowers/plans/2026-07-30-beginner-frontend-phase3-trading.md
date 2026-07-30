# Beginner Frontend Redesign — Phase 3: Trading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open trading: portfolio tables + endpoints (orders derived, never a mutable balance), the OrderTicket with Review dialog on the Trade view, the Portfolio page (Positions / Orders / Activity), the real Dashboard (stat cards, equity chart, holdings, watchlist widget, market overview), and the top-bar portfolio chip.

**Architecture:** Migration 0005 adds `portfolios`, `manual_orders`, `portfolio_equity`. Cash and positions are always **derived** from `manual_orders` (spec §7) by pure functions in `hedgefund/manual/portfolio_math.py` (dense pytest units). `portfolio_service.py` orchestrates: bootstrap-on-first-read of a $100k portfolio, fills at the latest cached price from Phase 2's `MarketDataCache`, equity series = hourly snapshots (new asyncio loop, same pattern as the paper ticker) + a live point computed on request. Frontend: `api/portfolio.ts` with hierarchical query keys (`['portfolio']`, `['portfolio','orders']`, `['portfolio','equity',range]`) so one invalidation refreshes everything after a fill; sonner toast links to Portfolio; validation errors render inline in the ticket, never as toasts.

**Tech Stack:** as Phase 2. No new frontend dependencies (recharts renders the equity area chart).

**Spec:** `docs/superpowers/specs/2026-07-30-beginner-frontend-redesign-design.md` (rollout Phase 3). Requires Phase 2 to be merged (MarketDataCache, `get_market_data`, `FakeMarketData`, AssetPage, `formatUsd`).

**Working directories:** backend from repo root (venv active); frontend from `dashboard/`. Git from repo root.

**Spec deltas locked in by this plan:**
- `GET /portfolio/orders` is added (the spec's endpoint table omits it, but the Orders tab needs history).
- **Limit orders deferred:** spec §5 says a Limit option appears in Pro view, but the spec §7 order endpoint is market-only (`{symbol, side, usd_amount}`, filled at cached price). Phase 3 ships market orders only; the limit-order UI + endpoint are revisited in Phase 5 polish.
- Settings page stays a ComingSoon (spec §9 puts it in Phase 5); its copy is updated to say so. `POST /portfolio/reset` ships now (needed for dev/tests).
- Activity tab shows buys/sells derived from orders; "advice taken" (Phase 4) and "new highs" events come later.
- Equity snapshots run in a **new** startup task (`equity_snapshot_loop`) rather than inside the paper ticker — same shared-loop pattern, but spec §7 forbids touching paper behavior.

---

## File map

| Action | Path | Responsibility |
|---|---|---|
| Create | `migrations/versions/0005_add_manual_portfolio_tables.py` | 3 new tables |
| Modify | `src/hedgefund/api/db/manual_models.py` | PortfolioRow, ManualOrderRow, PortfolioEquityRow |
| Modify | `src/hedgefund/api/db/manual_repository.py` | portfolio/orders/equity access |
| Create | `src/hedgefund/manual/portfolio_math.py` | pure order/position/P-L math |
| Create | `src/hedgefund/manual/portfolio_service.py` | view assembly, order placement, equity series |
| Create | `src/hedgefund/manual/equity_snapshots.py` | hourly snapshot loop |
| Modify | `src/hedgefund/api/config.py` | snapshot interval setting |
| Modify | `src/hedgefund/api/manual_schemas.py` | portfolio schemas |
| Create | `src/hedgefund/api/routes/manual_portfolio.py` | `/portfolio/*` |
| Modify | `src/hedgefund/api/app.py` | router + snapshot startup task |
| Modify | `tests/api/conftest.py` | disable snapshot loop in tests |
| Create | `tests/manual/test_portfolio_math.py`, `test_equity_snapshots.py`, `tests/api/test_manual_portfolio_routes.py` | backend tests |
| Modify | `dashboard/src/types.ts`, `src/lib/format.ts` (+test) | portfolio types, `formatUnits` |
| Create | `dashboard/src/api/portfolio.ts` (+test) | API module |
| Create | `dashboard/src/components/StatCard.tsx`, `MarketCard.tsx` (+tests) | dashboard building blocks |
| Create | `dashboard/src/components/OrderTicket.tsx` (+test) | ticket + Review dialog |
| Modify | `dashboard/src/pages/AssetPage.tsx` (+test) | real ticket + "You own" stat |
| Create | `dashboard/src/components/PositionsTable.tsx` (+test) | sortable positions |
| Create | `dashboard/src/pages/PortfolioPage.tsx` (+test) | tabs: Positions/Orders/Activity |
| Create | `dashboard/src/components/PortfolioEquityChart.tsx` | recharts area chart |
| Create | `dashboard/src/pages/DashboardPage.tsx` (+test) | real dashboard |
| Modify | `dashboard/src/layout/TopBar.tsx` (+test) | portfolio value + today's P/L chip |
| Modify | `dashboard/src/App.tsx` (+test) | mount Dashboard + Portfolio; update Settings copy |

---

### Task 1: Migration 0005, models, repository

**Files:**
- Create: `migrations/versions/0005_add_manual_portfolio_tables.py`
- Modify: `src/hedgefund/api/db/manual_models.py`
- Modify: `src/hedgefund/api/db/manual_repository.py`
- Test: `tests/api/test_manual_repository.py` (extend)

- [ ] **Step 1: Write the failing repository tests**

Append to `tests/api/test_manual_repository.py`:

```python
from datetime import datetime, timedelta, timezone


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
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
python -m pytest tests/api/test_manual_repository.py -v
```

Expected: FAIL — `AttributeError: 'ManualRepository' object has no attribute 'get_active_portfolio'`.

- [ ] **Step 3: Add the models**

Append to `src/hedgefund/api/db/manual_models.py` (extend the imports to include `uuid`, `Float`, `ForeignKey`, `UUID`):

```python
import uuid

from sqlalchemy import Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID


class PortfolioRow(Base):
    __tablename__ = "portfolios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    starting_cash: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ManualOrderRow(Base):
    __tablename__ = "manual_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("portfolios.id"), nullable=False
    )
    symbol: Mapped[str] = mapped_column(String, nullable=False)
    side: Mapped[str] = mapped_column(String, nullable=False)
    usd_amount: Mapped[float] = mapped_column(Float, nullable=False)
    units: Mapped[float] = mapped_column(Float, nullable=False)
    fill_price: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PortfolioEquityRow(Base):
    __tablename__ = "portfolio_equity"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("portfolios.id"), nullable=False
    )
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    equity: Mapped[float] = mapped_column(Float, nullable=False)
```

- [ ] **Step 4: Extend the repository**

Append to `ManualRepository` in `src/hedgefund/api/db/manual_repository.py` (extend imports: `import uuid`, `from datetime import datetime`, and the three new models):

```python
    # ---- portfolios (Phase 3) ----

    def get_active_portfolio(self) -> PortfolioRow | None:
        stmt = select(PortfolioRow).order_by(PortfolioRow.created_at.desc()).limit(1)
        return self._s.scalars(stmt).first()

    def create_portfolio(self, starting_cash: float) -> PortfolioRow:
        row = PortfolioRow(id=uuid.uuid4(), starting_cash=starting_cash)
        self._s.add(row)
        self._s.flush()
        return row

    def get_or_create_active_portfolio(self, default_cash: float) -> PortfolioRow:
        return self.get_active_portfolio() or self.create_portfolio(default_cash)

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
```

- [ ] **Step 5: Create migration 0005**

Create `migrations/versions/0005_add_manual_portfolio_tables.py`:

```python
"""add portfolios, manual_orders, portfolio_equity tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "portfolios",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("starting_cash", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_table(
        "manual_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("portfolio_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("portfolios.id"), nullable=False),
        sa.Column("symbol", sa.String(), nullable=False),
        sa.Column("side", sa.String(), nullable=False),
        sa.Column("usd_amount", sa.Float(), nullable=False),
        sa.Column("units", sa.Float(), nullable=False),
        sa.Column("fill_price", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_table(
        "portfolio_equity",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("portfolio_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("portfolios.id"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("equity", sa.Float(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("portfolio_equity")
    op.drop_table("manual_orders")
    op.drop_table("portfolios")
```

- [ ] **Step 6: Apply migration, run tests, commit**

```powershell
alembic upgrade head
python -m pytest tests/api/test_manual_repository.py -v
git add migrations src/hedgefund/api/db tests/api/test_manual_repository.py
git commit -m "feat(api): add manual portfolio tables, models, and repository"
```

Expected: migration clean; tests PASS.

---

### Task 2: portfolio_math — pure order/position/P-L math (dense TDD)

**Files:**
- Create: `src/hedgefund/manual/portfolio_math.py`
- Test: `tests/manual/test_portfolio_math.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/manual/test_portfolio_math.py`:

```python
from __future__ import annotations

from dataclasses import dataclass

import pytest

from hedgefund.manual.portfolio_math import (
    Holding,
    OrderValidationError,
    compute_totals,
    derive_cash,
    derive_holdings,
    position_view,
    units_for,
    validate_order,
)


@dataclass(frozen=True)
class Order:
    symbol: str
    side: str
    usd_amount: float
    units: float
    fill_price: float


def buy(symbol, usd, price):
    return Order(symbol, "buy", usd, usd / price, price)


def sell(symbol, usd, price):
    return Order(symbol, "sell", usd, usd / price, price)


class TestDeriveCash:
    def test_no_orders(self):
        assert derive_cash(100_000.0, []) == 100_000.0

    def test_buys_reduce_and_sells_add(self):
        orders = [buy("BTC", 1_000.0, 100.0), sell("BTC", 400.0, 80.0)]
        assert derive_cash(100_000.0, orders) == pytest.approx(99_400.0)


class TestDeriveHoldings:
    def test_single_buy(self):
        h = derive_holdings([buy("BTC", 1_000.0, 100.0)])
        assert h["BTC"] == Holding(units=10.0, avg_cost=100.0)

    def test_two_buys_weighted_avg_cost(self):
        h = derive_holdings([buy("BTC", 1_000.0, 100.0), buy("BTC", 1_000.0, 200.0)])
        # 10 units @100 + 5 units @200 → 15 units, avg (1000+1000)/15
        assert h["BTC"].units == pytest.approx(15.0)
        assert h["BTC"].avg_cost == pytest.approx(2_000.0 / 15.0)

    def test_sell_reduces_units_keeps_avg_cost(self):
        h = derive_holdings([buy("BTC", 1_000.0, 100.0), sell("BTC", 500.0, 125.0)])
        assert h["BTC"].units == pytest.approx(6.0)  # 10 - 4
        assert h["BTC"].avg_cost == pytest.approx(100.0)

    def test_sell_all_removes_position(self):
        h = derive_holdings([buy("BTC", 1_000.0, 100.0), sell("BTC", 1_000.0, 100.0)])
        assert "BTC" not in h

    def test_symbols_are_independent(self):
        h = derive_holdings([buy("BTC", 1_000.0, 100.0), buy("ETH", 500.0, 10.0)])
        assert h["BTC"].units == pytest.approx(10.0)
        assert h["ETH"].units == pytest.approx(50.0)


class TestUnitsFor:
    def test_division(self):
        assert units_for(250.0, 100.0) == pytest.approx(2.5)


class TestValidateOrder:
    def test_minimum_order(self):
        with pytest.raises(OrderValidationError, match="at least"):
            validate_order("buy", 0.5, price=100.0, cash=1_000.0, held_units=0.0)

    def test_buy_exactly_all_cash_is_allowed(self):
        validate_order("buy", 1_000.0, price=100.0, cash=1_000.0, held_units=0.0)

    def test_buy_over_cash_rejected_with_friendly_message(self):
        with pytest.raises(OrderValidationError, match=r"\$1,000\.00"):
            validate_order("buy", 1_000.01, price=100.0, cash=1_000.0, held_units=0.0)

    def test_sell_up_to_held_value_allowed(self):
        validate_order("sell", 500.0, price=100.0, cash=0.0, held_units=5.0)

    def test_sell_over_held_value_rejected(self):
        with pytest.raises(OrderValidationError, match="only hold"):
            validate_order("sell", 501.0, price=100.0, cash=0.0, held_units=5.0)


class TestPositionView:
    def test_pnl_math(self):
        view = position_view("BTC", Holding(units=10.0, avg_cost=100.0),
                             price=110.0, price_24h_ago=105.0)
        assert view.market_value == pytest.approx(1_100.0)
        assert view.unrealized_pl == pytest.approx(100.0)
        assert view.unrealized_pl_pct == pytest.approx(0.1)
        assert view.change_24h_pl == pytest.approx(50.0)


class TestComputeTotals:
    def test_equity_today_and_return(self):
        positions = [
            position_view("BTC", Holding(10.0, 100.0), price=110.0, price_24h_ago=105.0),
        ]
        totals = compute_totals(starting_cash=100_000.0, cash=99_000.0, positions=positions)
        assert totals.equity == pytest.approx(100_100.0)
        assert totals.today_pl == pytest.approx(50.0)
        assert totals.total_return_pct == pytest.approx(0.001)
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
python -m pytest tests/manual/test_portfolio_math.py -v
```

Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

Create `src/hedgefund/manual/portfolio_math.py`:

```python
from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Protocol

MIN_ORDER_USD = 1.0
# Dollar-scale float tolerance: exact-balance orders ("Max") must not be
# rejected for representation error.
_EPSILON = 1e-6


class OrderLike(Protocol):
    symbol: str
    side: str
    usd_amount: float
    units: float
    fill_price: float


class OrderValidationError(ValueError):
    """Raised with a user-friendly message when an order cannot be filled."""


@dataclass(frozen=True)
class Holding:
    units: float
    avg_cost: float


@dataclass(frozen=True)
class PositionView:
    symbol: str
    units: float
    avg_cost: float
    price: float
    market_value: float
    unrealized_pl: float
    unrealized_pl_pct: float
    change_24h_pl: float


@dataclass(frozen=True)
class PortfolioTotals:
    equity: float
    today_pl: float
    total_return_pct: float


def derive_cash(starting_cash: float, orders: Iterable[OrderLike]) -> float:
    cash = starting_cash
    for order in orders:
        cash += order.usd_amount if order.side == "sell" else -order.usd_amount
    return cash


def derive_holdings(orders: Iterable[OrderLike]) -> dict[str, Holding]:
    holdings: dict[str, Holding] = {}
    for order in orders:
        held = holdings.get(order.symbol, Holding(0.0, 0.0))
        if order.side == "buy":
            total_units = held.units + order.units
            avg_cost = (
                held.units * held.avg_cost + order.units * order.fill_price
            ) / total_units
            holdings[order.symbol] = Holding(total_units, avg_cost)
        else:
            remaining = held.units - order.units
            if remaining <= _EPSILON:
                holdings.pop(order.symbol, None)
            else:
                holdings[order.symbol] = Holding(remaining, held.avg_cost)
    return holdings


def units_for(usd_amount: float, price: float) -> float:
    return usd_amount / price


def validate_order(
    side: str, usd_amount: float, *, price: float, cash: float, held_units: float
) -> None:
    if usd_amount < MIN_ORDER_USD:
        raise OrderValidationError(f"Orders must be at least ${MIN_ORDER_USD:.2f}.")
    if side == "buy" and usd_amount > cash + _EPSILON:
        raise OrderValidationError(
            f"Not enough buying power — you have ${cash:,.2f} available."
        )
    if side == "sell":
        held_value = held_units * price
        if usd_amount > held_value + _EPSILON:
            raise OrderValidationError(
                f"You only hold ${held_value:,.2f} of this coin."
            )


def position_view(
    symbol: str, holding: Holding, *, price: float, price_24h_ago: float
) -> PositionView:
    market_value = holding.units * price
    cost = holding.units * holding.avg_cost
    unrealized = market_value - cost
    return PositionView(
        symbol=symbol,
        units=holding.units,
        avg_cost=holding.avg_cost,
        price=price,
        market_value=market_value,
        unrealized_pl=unrealized,
        unrealized_pl_pct=unrealized / cost if cost > _EPSILON else 0.0,
        change_24h_pl=holding.units * (price - price_24h_ago),
    )


def compute_totals(
    *, starting_cash: float, cash: float, positions: Sequence[PositionView]
) -> PortfolioTotals:
    equity = cash + sum(p.market_value for p in positions)
    return PortfolioTotals(
        equity=equity,
        today_pl=sum(p.change_24h_pl for p in positions),
        total_return_pct=(equity - starting_cash) / starting_cash,
    )
```

- [ ] **Step 4: Run tests, commit**

```powershell
python -m pytest tests/manual/test_portfolio_math.py -v
git add src/hedgefund/manual tests/manual
git commit -m "feat(manual): add pure portfolio math with dense unit coverage"
```

Expected: PASS (15 tests).

---

### Task 3: portfolio_service — view assembly, order placement, equity series

**Files:**
- Create: `src/hedgefund/manual/portfolio_service.py`
- Test: covered by route tests in Task 5 (the service is thin orchestration over Task 2 math + the repository; the math already has dense units)

- [ ] **Step 1: Implement the service**

Create `src/hedgefund/manual/portfolio_service.py`:

```python
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from hedgefund.manual import portfolio_math as pm
from hedgefund.manual.market_data import (
    AssetQuote,
    MarketDataProvider,
    PricesUnavailableError,
    UnknownSymbolError,
)

DEFAULT_STARTING_CASH = 100_000.0
EQUITY_RANGE_DAYS: dict[str, int | None] = {
    "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365, "ALL": None,
}


@dataclass(frozen=True)
class PortfolioViewData:
    portfolio_id: uuid.UUID
    starting_cash: float
    cash: float
    positions: tuple[pm.PositionView, ...]
    equity: float
    today_pl: float
    total_return_pct: float
    stale: bool
    created_at: datetime


def _price_24h_ago(quote: AssetQuote) -> float:
    return quote.sparkline[0] if quote.sparkline else quote.price


def get_portfolio_view(repo, market: MarketDataProvider) -> PortfolioViewData:
    """Assemble the full portfolio payload. May create the bootstrap portfolio —
    the caller commits."""
    portfolio = repo.get_or_create_active_portfolio(DEFAULT_STARTING_CASH)
    orders = repo.list_orders(portfolio.id)
    cash = pm.derive_cash(portfolio.starting_cash, orders)
    holdings = pm.derive_holdings(orders)

    snapshot = market.get_assets()
    quotes = {q.symbol: q for q in snapshot.assets}
    positions = []
    for symbol in sorted(holdings):
        quote = quotes.get(symbol)
        if quote is None:  # held coin missing from the snapshot → cannot price
            raise PricesUnavailableError(symbol)
        positions.append(
            pm.position_view(
                symbol, holdings[symbol],
                price=quote.price, price_24h_ago=_price_24h_ago(quote),
            )
        )

    totals = pm.compute_totals(
        starting_cash=portfolio.starting_cash, cash=cash, positions=positions
    )
    return PortfolioViewData(
        portfolio_id=portfolio.id,
        starting_cash=portfolio.starting_cash,
        cash=cash,
        positions=tuple(positions),
        equity=totals.equity,
        today_pl=totals.today_pl,
        total_return_pct=totals.total_return_pct,
        stale=snapshot.stale,
        created_at=portfolio.created_at,
    )


def place_order(repo, market: MarketDataProvider, *, symbol: str, side: str, usd_amount: float):
    """Validate and fill a market order at the latest cached price. Caller commits.

    Raises OrderValidationError (400), UnknownSymbolError (404),
    PricesUnavailableError (503)."""
    portfolio = repo.get_or_create_active_portfolio(DEFAULT_STARTING_CASH)
    orders = repo.list_orders(portfolio.id)
    cash = pm.derive_cash(portfolio.starting_cash, orders)
    holdings = pm.derive_holdings(orders)

    quotes = {q.symbol: q for q in market.get_assets().assets}
    quote = quotes.get(symbol)
    if quote is None:
        raise UnknownSymbolError(symbol)

    held = holdings.get(symbol, pm.Holding(0.0, 0.0))
    pm.validate_order(side, usd_amount, price=quote.price, cash=cash, held_units=held.units)
    units = pm.units_for(usd_amount, quote.price)
    return repo.add_order(
        portfolio.id, symbol=symbol, side=side,
        usd_amount=usd_amount, units=units, fill_price=quote.price,
    )


def get_equity_series(
    repo, market: MarketDataProvider, range_key: str
) -> list[tuple[datetime, float]]:
    """Snapshots within the range plus a live point computed from current prices."""
    days = EQUITY_RANGE_DAYS[range_key]
    view = get_portfolio_view(repo, market)
    since = datetime.now(timezone.utc) - timedelta(days=days) if days else None
    rows = repo.list_equity(view.portfolio_id, since)
    points = [(row.ts, row.equity) for row in rows]
    points.append((datetime.now(timezone.utc), view.equity))
    return points
```

- [ ] **Step 2: Sanity import check**

```powershell
python -c "from hedgefund.manual import portfolio_service; print('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```powershell
git add src/hedgefund/manual
git commit -m "feat(manual): add portfolio service for views, fills, and equity series"
```

---

### Task 4: Hourly equity snapshot loop + config

**Files:**
- Create: `src/hedgefund/manual/equity_snapshots.py`
- Modify: `src/hedgefund/api/config.py`
- Test: `tests/manual/test_equity_snapshots.py`

- [ ] **Step 1: Write the failing test**

Create `tests/manual/test_equity_snapshots.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from hedgefund.manual.equity_snapshots import snapshot_once
from tests.fixtures.market import FakeMarketData


class FakeRepo:
    def __init__(self, portfolio=None):
        self.portfolio = portfolio
        self.points = []

    def get_active_portfolio(self):
        return self.portfolio

    def get_or_create_active_portfolio(self, default_cash):
        return self.portfolio

    def list_orders(self, portfolio_id):
        return []

    def add_equity_point(self, portfolio_id, ts, equity):
        self.points.append((portfolio_id, ts, equity))


def make_portfolio():
    return SimpleNamespace(
        id=uuid.uuid4(), starting_cash=100_000.0,
        created_at=datetime.now(timezone.utc),
    )


def test_snapshot_skips_when_no_portfolio_exists():
    repo = FakeRepo(portfolio=None)
    assert snapshot_once(repo, FakeMarketData()) is None
    assert repo.points == []


def test_snapshot_records_current_equity():
    repo = FakeRepo(portfolio=make_portfolio())
    equity = snapshot_once(repo, FakeMarketData())
    assert equity == 100_000.0  # no orders → equity == starting cash
    assert len(repo.points) == 1
    assert repo.points[0][2] == 100_000.0


def test_snapshot_swallows_price_outage():
    market = FakeMarketData()
    market.unavailable = True
    repo = FakeRepo(portfolio=make_portfolio())
    assert snapshot_once(repo, market) is None
    assert repo.points == []
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
python -m pytest tests/manual/test_equity_snapshots.py -v
```

Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement the loop**

Create `src/hedgefund/manual/equity_snapshots.py`:

```python
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from hedgefund.manual.market_data import MarketDataProvider, PricesUnavailableError
from hedgefund.manual.portfolio_service import get_portfolio_view

logger = logging.getLogger(__name__)


def snapshot_once(repo, market: MarketDataProvider) -> float | None:
    """Record one equity point for the active portfolio. Never creates a
    portfolio; skips quietly when prices are down (next cycle retries)."""
    if repo.get_active_portfolio() is None:
        return None
    try:
        view = get_portfolio_view(repo, market)
    except PricesUnavailableError:
        logger.warning("equity snapshot skipped: prices unavailable")
        return None
    repo.add_equity_point(view.portfolio_id, datetime.now(timezone.utc), view.equity)
    return view.equity


async def equity_snapshot_loop(
    session_factory, market: MarketDataProvider, interval_seconds: int
) -> None:
    """Background loop mirroring paper.ticker_loop: sync DB + ccxt work runs in
    a worker thread; the loop never dies."""
    from hedgefund.api.db.manual_repository import ManualRepository

    while True:
        def _cycle() -> None:
            db = session_factory()
            try:
                snapshot_once(ManualRepository(db), market)
                db.commit()
            finally:
                db.close()

        try:
            await asyncio.to_thread(_cycle)
        except Exception:  # noqa: BLE001 - never let the loop die
            logger.exception("equity snapshot cycle crashed; continuing")
        await asyncio.sleep(interval_seconds)
```

- [ ] **Step 4: Add the interval setting**

In `src/hedgefund/api/config.py`, add a `manual_equity_snapshot_seconds: int = 3600` parameter to `Settings.__init__` (assign `self.manual_equity_snapshot_seconds = manual_equity_snapshot_seconds`), and in `get_settings()` pass:

```python
        manual_equity_snapshot_seconds=int(
            os.environ.get("MANUAL_EQUITY_SNAPSHOT_SECONDS", "3600")
        ),
```

- [ ] **Step 5: Run tests, commit**

```powershell
python -m pytest tests/manual/test_equity_snapshots.py -v
git add src/hedgefund/manual src/hedgefund/api/config.py tests/manual
git commit -m "feat(manual): add hourly equity snapshot loop"
```

Expected: PASS (3 tests).

---

### Task 5: Portfolio schemas, routes, app wiring, route tests

**Files:**
- Modify: `src/hedgefund/api/manual_schemas.py`
- Create: `src/hedgefund/api/routes/manual_portfolio.py`
- Modify: `src/hedgefund/api/app.py`
- Modify: `tests/api/conftest.py`
- Test: `tests/api/test_manual_portfolio_routes.py`

- [ ] **Step 1: Write the failing route tests**

Create `tests/api/test_manual_portfolio_routes.py`. The `client` fixture's `FakeMarketData` serves BTC @ $100 (sparkline[0] = $95) and ETH @ $10:

```python
from __future__ import annotations

import pytest


def test_get_portfolio_bootstraps_100k(client):
    res = client.get("/portfolio")
    assert res.status_code == 200
    body = res.json()
    assert body["starting_cash"] == 100_000.0
    assert body["cash"] == 100_000.0
    assert body["positions"] == []
    assert body["equity"] == 100_000.0
    assert body["total_return_pct"] == 0.0


def test_buy_creates_position_and_reduces_cash(client):
    res = client.post("/portfolio/orders",
                      json={"symbol": "BTC", "side": "buy", "usd_amount": 1000.0})
    assert res.status_code == 201
    order = res.json()
    assert order["units"] == pytest.approx(10.0)
    assert order["fill_price"] == 100.0

    body = client.get("/portfolio").json()
    assert body["cash"] == pytest.approx(99_000.0)
    pos = body["positions"][0]
    assert pos["symbol"] == "BTC"
    assert pos["units"] == pytest.approx(10.0)
    assert pos["market_value"] == pytest.approx(1_000.0)
    # today's P/L: 10 units * (100 - 95 sparkline[0]) = 50
    assert body["today_pl"] == pytest.approx(50.0)


def test_buy_over_cash_rejected_with_friendly_message(client):
    res = client.post("/portfolio/orders",
                      json={"symbol": "BTC", "side": "buy", "usd_amount": 200_000.0})
    assert res.status_code == 400
    assert "buying power" in res.json()["detail"]


def test_sell_more_than_held_rejected(client):
    client.post("/portfolio/orders",
                json={"symbol": "BTC", "side": "buy", "usd_amount": 1000.0})
    res = client.post("/portfolio/orders",
                      json={"symbol": "BTC", "side": "sell", "usd_amount": 2000.0})
    assert res.status_code == 400
    assert "only hold" in res.json()["detail"]


def test_order_unknown_symbol_404(client):
    res = client.post("/portfolio/orders",
                      json={"symbol": "ZZZ", "side": "buy", "usd_amount": 100.0})
    assert res.status_code == 404


def test_order_rejected_when_prices_unavailable(client, market_data):
    market_data.unavailable = True
    res = client.post("/portfolio/orders",
                      json={"symbol": "BTC", "side": "buy", "usd_amount": 100.0})
    assert res.status_code == 503


def test_orders_listed_newest_first(client):
    client.post("/portfolio/orders",
                json={"symbol": "BTC", "side": "buy", "usd_amount": 100.0})
    client.post("/portfolio/orders",
                json={"symbol": "ETH", "side": "buy", "usd_amount": 50.0})
    orders = client.get("/portfolio/orders").json()
    assert [o["symbol"] for o in orders] == ["ETH", "BTC"]


def test_equity_series_includes_live_point(client):
    res = client.get("/portfolio/equity?range=1M")
    assert res.status_code == 200
    body = res.json()
    assert body["range"] == "1M"
    assert len(body["points"]) == 1  # no snapshots yet → live point only
    assert body["points"][0]["equity"] == pytest.approx(100_000.0)


def test_equity_bad_range_422(client):
    assert client.get("/portfolio/equity?range=5Y").status_code == 422


def test_reset_starts_a_fresh_portfolio(client):
    client.post("/portfolio/orders",
                json={"symbol": "BTC", "side": "buy", "usd_amount": 1000.0})
    res = client.post("/portfolio/reset", json={"starting_cash": 100_000.0})
    assert res.status_code == 201

    body = client.get("/portfolio").json()
    assert body["cash"] == 100_000.0
    assert body["positions"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
python -m pytest tests/api/test_manual_portfolio_routes.py -v
```

Expected: FAIL — 404s (router not mounted).

- [ ] **Step 3: Add the schemas**

Append to `src/hedgefund/api/manual_schemas.py` (extend imports with `import uuid` and `from typing import Literal`, plus `Field` from pydantic):

```python
class PositionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    symbol: str
    units: float
    avg_cost: float
    price: float
    market_value: float
    unrealized_pl: float
    unrealized_pl_pct: float
    change_24h_pl: float


class PortfolioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    portfolio_id: uuid.UUID
    starting_cash: float
    cash: float
    positions: list[PositionOut]
    equity: float
    today_pl: float
    total_return_pct: float
    stale: bool
    created_at: datetime


class ManualOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    symbol: str
    side: str
    usd_amount: float
    units: float
    fill_price: float
    created_at: datetime


class PlaceOrderRequest(BaseModel):
    symbol: str
    side: Literal["buy", "sell"]
    usd_amount: float = Field(gt=0)


class ResetPortfolioRequest(BaseModel):
    starting_cash: float = Field(default=100_000.0, gt=0)


class PortfolioCreatedResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    starting_cash: float
    created_at: datetime


class EquityPointOut(BaseModel):
    ts: datetime
    equity: float


class EquitySeriesResponse(BaseModel):
    range: str
    points: list[EquityPointOut]
```

- [ ] **Step 4: Create the routes**

Create `src/hedgefund/api/routes/manual_portfolio.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from hedgefund.api.db.engine import get_session
from hedgefund.api.db.manual_repository import ManualRepository
from hedgefund.api.deps import get_market_data
from hedgefund.api.manual_schemas import (
    EquityPointOut,
    EquitySeriesResponse,
    ManualOrderOut,
    PlaceOrderRequest,
    PortfolioCreatedResponse,
    PortfolioResponse,
    ResetPortfolioRequest,
)
from hedgefund.manual.market_data import PricesUnavailableError, UnknownSymbolError
from hedgefund.manual.portfolio_math import OrderValidationError
from hedgefund.manual.portfolio_service import (
    DEFAULT_STARTING_CASH,
    EQUITY_RANGE_DAYS,
    get_equity_series,
    get_portfolio_view,
    place_order,
)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

_UNAVAILABLE_MSG = "Prices are temporarily unavailable — please try again shortly."


@router.get("", response_model=PortfolioResponse)
def get_portfolio(
    session: Session = Depends(get_session), market=Depends(get_market_data)
) -> PortfolioResponse:
    repo = ManualRepository(session)
    try:
        view = get_portfolio_view(repo, market)
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    session.commit()  # first call may create the bootstrap portfolio row
    return PortfolioResponse.model_validate(view)


@router.get("/orders", response_model=list[ManualOrderOut])
def list_orders(session: Session = Depends(get_session)) -> list[ManualOrderOut]:
    repo = ManualRepository(session)
    portfolio = repo.get_or_create_active_portfolio(DEFAULT_STARTING_CASH)
    session.commit()
    rows = repo.list_orders(portfolio.id)
    return [ManualOrderOut.model_validate(row) for row in reversed(rows)]


@router.post("/orders", response_model=ManualOrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    body: PlaceOrderRequest,
    session: Session = Depends(get_session),
    market=Depends(get_market_data),
) -> ManualOrderOut:
    repo = ManualRepository(session)
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
) -> EquitySeriesResponse:
    if range not in EQUITY_RANGE_DAYS:
        raise HTTPException(
            status_code=422, detail=f"range must be one of {sorted(EQUITY_RANGE_DAYS)}"
        )
    repo = ManualRepository(session)
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
    body: ResetPortfolioRequest, session: Session = Depends(get_session)
) -> PortfolioCreatedResponse:
    repo = ManualRepository(session)
    row = repo.create_portfolio(starting_cash=body.starting_cash)
    session.commit()
    session.refresh(row)
    return PortfolioCreatedResponse.model_validate(row)
```

- [ ] **Step 5: Wire router + snapshot task into the app; disable the loop in tests**

In `src/hedgefund/api/app.py`:

1. Import: `from hedgefund.api.routes.manual_portfolio import router as manual_portfolio_router` and mount it with the other routers.
2. Add a startup hook after the paper-ticker one:

```python
    @app.on_event("startup")
    async def _start_equity_snapshots() -> None:
        if os.environ.get("MANUAL_EQUITY_SNAPSHOTS_ENABLED", "1") != "1":
            return
        from hedgefund.api.config import get_settings
        from hedgefund.api.db.engine import SessionLocal
        from hedgefund.api.deps import get_market_data
        from hedgefund.manual.equity_snapshots import equity_snapshot_loop

        asyncio.create_task(
            equity_snapshot_loop(
                SessionLocal,
                get_market_data(),
                interval_seconds=get_settings().manual_equity_snapshot_seconds,
            )
        )
```

3. In `tests/api/conftest.py`, next to the existing `PAPER_TICKER_ENABLED` line add:

```python
os.environ.setdefault("MANUAL_EQUITY_SNAPSHOTS_ENABLED", "0")
```

- [ ] **Step 6: Run route tests, then the full backend suite; commit**

```powershell
python -m pytest tests/api/test_manual_portfolio_routes.py -v
python -m pytest
git add src/hedgefund/api tests
git commit -m "feat(api): add manual portfolio endpoints with derived positions"
```

Expected: new tests PASS (10); full suite green.

---

### Task 6: Frontend types, api/portfolio.ts, formatUnits

**Files:**
- Modify: `dashboard/src/types.ts`
- Create: `dashboard/src/api/portfolio.ts`
- Test: `dashboard/src/api/portfolio.test.ts`
- Modify: `dashboard/src/lib/format.ts` + `format.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `dashboard/src/api/portfolio.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPortfolio, placeOrder } from './portfolio'

function okJson(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
}

describe('portfolio api', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches the portfolio summary', async () => {
    const fetchMock = vi.fn(() => okJson({}))
    vi.stubGlobal('fetch', fetchMock)
    await getPortfolio()
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/portfolio', undefined)
  })

  it('posts an order as JSON', async () => {
    const fetchMock = vi.fn(() => okJson({}))
    vi.stubGlobal('fetch', fetchMock)
    await placeOrder({ symbol: 'BTC', side: 'buy', usd_amount: 250 })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/portfolio/orders',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ symbol: 'BTC', side: 'buy', usd_amount: 250 }),
      }),
    )
  })
})
```

Append to `dashboard/src/lib/format.test.ts`:

```ts
import { formatUnits } from './format'

describe('formatUnits', () => {
  it('shows 4 decimals for amounts >= 1', () => {
    expect(formatUnits(12.34567)).toBe('12.3457')
  })

  it('shows 4 significant digits for small amounts', () => {
    expect(formatUnits(0.00123456)).toBe('0.001235')
  })

  it('handles zero', () => {
    expect(formatUnits(0)).toBe('0')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
cd dashboard
npx vitest run src/api/portfolio.test.ts src/lib/format.test.ts
```

Expected: FAIL — modules/exports missing.

- [ ] **Step 3: Add types, API module, formatUnits**

Append to `dashboard/src/types.ts`:

```ts
export type EquityRange = TimeRange | 'ALL'

export interface Position {
  symbol: string
  units: number
  avg_cost: number
  price: number
  market_value: number
  unrealized_pl: number
  unrealized_pl_pct: number
  change_24h_pl: number
}

export interface PortfolioSummary {
  portfolio_id: string
  starting_cash: number
  cash: number
  positions: Position[]
  equity: number
  today_pl: number
  total_return_pct: number
  stale: boolean
  created_at: string
}

export interface ManualOrder {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  usd_amount: number
  units: number
  fill_price: number
  created_at: string
}

export interface PlaceOrderRequest {
  symbol: string
  side: 'buy' | 'sell'
  usd_amount: number
}

export interface ManualEquityPoint {
  ts: string
  equity: number
}

export interface EquitySeriesResponse {
  range: EquityRange
  points: ManualEquityPoint[]
}
```

Create `dashboard/src/api/portfolio.ts`:

```ts
import { apiFetch } from './client'
import type {
  EquityRange,
  EquitySeriesResponse,
  ManualOrder,
  PlaceOrderRequest,
  PortfolioSummary,
} from '../types'

export function getPortfolio(): Promise<PortfolioSummary> {
  return apiFetch<PortfolioSummary>('/portfolio')
}

export function getPortfolioOrders(): Promise<ManualOrder[]> {
  return apiFetch<ManualOrder[]>('/portfolio/orders')
}

export function getPortfolioEquity(range: EquityRange): Promise<EquitySeriesResponse> {
  return apiFetch<EquitySeriesResponse>(`/portfolio/equity?range=${range}`)
}

export function placeOrder(body: PlaceOrderRequest): Promise<ManualOrder> {
  return apiFetch<ManualOrder>('/portfolio/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
```

Append to `dashboard/src/lib/format.ts`:

```ts
export function formatUnits(units: number): string {
  if (units === 0) return '0'
  if (Math.abs(units) >= 1) return units.toFixed(4)
  return units.toPrecision(4)
}
```

- [ ] **Step 4: Run tests, commit**

```powershell
npx vitest run src/api/portfolio.test.ts src/lib/format.test.ts
cd ..
git add dashboard/src
git commit -m "feat(dashboard): add portfolio api module and unit formatting"
```

Expected: PASS.

---

### Task 7: StatCard + MarketCard

**Files:**
- Create: `dashboard/src/components/StatCard.tsx`
- Create: `dashboard/src/components/MarketCard.tsx`
- Test: `dashboard/src/components/StatCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/components/StatCard.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from './StatCard'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Portfolio Value" value="$100,000.00" />)
    expect(screen.getByText('Portfolio Value')).toBeInTheDocument()
    expect(screen.getByText('$100,000.00')).toBeInTheDocument()
  })

  it('colors the sub line by tone', () => {
    render(<StatCard label="Today's P/L" value="+$50.00" sub="+0.05%" tone="profit" />)
    expect(screen.getByText('+0.05%')).toHaveClass('text-profit')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```powershell
cd dashboard
npx vitest run src/components/StatCard.test.tsx
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement both components**

Create `dashboard/src/components/StatCard.tsx`:

```tsx
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  value: string
  sub?: string
  tone?: 'profit' | 'loss' | 'neutral'
}

export function StatCard({ label, value, sub, tone = 'neutral' }: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
        {sub && (
          <p
            className={cn(
              'mt-0.5 text-xs tabular-nums',
              tone === 'profit' && 'text-profit',
              tone === 'loss' && 'text-loss',
              tone === 'neutral' && 'text-muted-foreground',
            )}
          >
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

Create `dashboard/src/components/MarketCard.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatPct, formatUsd } from '../lib/format'
import { CoinIcon } from './CoinIcon'
import { Sparkline } from './Sparkline'
import type { AssetQuote } from '../types'

export function MarketCard({ asset }: { asset: AssetQuote }) {
  const isPositive = asset.change_24h_pct >= 0
  return (
    <Link to={`/coins/${asset.symbol}`}>
      <Card className="transition-colors duration-200 hover:border-primary/40">
        <CardContent className="flex items-center gap-3 p-4">
          <CoinIcon symbol={asset.symbol} className="size-8 text-[10px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{asset.name}</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatUsd(asset.price)}
            </p>
          </div>
          <div className="text-right">
            <Sparkline data={asset.sparkline} isPositive={isPositive} />
            <p
              className={cn(
                'text-xs tabular-nums',
                isPositive ? 'text-profit' : 'text-loss',
              )}
            >
              {formatPct(asset.change_24h_pct)}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 4: Run tests, commit**

```powershell
npx vitest run src/components/StatCard.test.tsx
cd ..
git add dashboard/src/components
git commit -m "feat(dashboard): add stat card and market overview card"
```

Expected: PASS (2 tests).

---

### Task 8: OrderTicket with Review dialog

**Files:**
- Create: `dashboard/src/components/OrderTicket.tsx`
- Test: `dashboard/src/components/OrderTicket.test.tsx`

Behavior (spec §5/§8): Buy/Sell segmented toggle; dollar input with chips $50/$100/$500/Max; estimated units; buying power after; CTA opens Review dialog; confirm posts the order; success → sonner toast with a Portfolio link + invalidate `['portfolio']` queries; validation and server errors render **inline in the ticket**, never as toasts. Market orders only (limit deferred, see header).

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/components/OrderTicket.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OrderTicket } from './OrderTicket'
import * as portfolioApi from '../api/portfolio'
import { toast } from 'sonner'

vi.mock('../api/portfolio')
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

function renderTicket(props: Partial<Parameters<typeof OrderTicket>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <OrderTicket symbol="BTC" price={100} cash={1000} heldUnits={5} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OrderTicket', () => {
  beforeEach(() => {
    vi.mocked(portfolioApi.placeOrder).mockResolvedValue({
      id: '1', symbol: 'BTC', side: 'buy', usd_amount: 250,
      units: 2.5, fill_price: 100, created_at: '2026-07-30T12:00:00Z',
    })
  })

  it('shows estimated units for the entered amount', async () => {
    renderTicket()
    await userEvent.type(screen.getByLabelText(/amount/i), '250')
    expect(screen.getByText(/2\.5000 BTC/)).toBeInTheDocument()
  })

  it('shows an inline error when buying over available cash', async () => {
    renderTicket()
    await userEvent.type(screen.getByLabelText(/amount/i), '5000')
    expect(screen.getByText(/not enough buying power/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /review order/i })).toBeDisabled()
  })

  it('shows an inline error when selling more than held', async () => {
    renderTicket()
    await userEvent.click(screen.getByRole('button', { name: /^sell$/i }))
    await userEvent.type(screen.getByLabelText(/amount/i), '600') // held 5 * $100 = $500
    expect(screen.getByText(/only hold/i)).toBeInTheDocument()
  })

  it('reviews then places the order and toasts with a portfolio link', async () => {
    renderTicket()
    await userEvent.type(screen.getByLabelText(/amount/i), '250')
    await userEvent.click(screen.getByRole('button', { name: /review order/i }))
    expect(await screen.findByText(/buy \$250\.00 of btc/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(portfolioApi.placeOrder).toHaveBeenCalledWith({
      symbol: 'BTC', side: 'buy', usd_amount: 250,
    })
    expect(vi.mocked(toast.success)).toHaveBeenCalled()
  })

  it('renders a server rejection inline', async () => {
    vi.mocked(portfolioApi.placeOrder).mockRejectedValue(
      new Error('Not enough buying power — you have $12.00 available.'),
    )
    renderTicket()
    await userEvent.type(screen.getByLabelText(/amount/i), '250')
    await userEvent.click(screen.getByRole('button', { name: /review order/i }))
    await userEvent.click(await screen.findByRole('button', { name: /confirm/i }))
    expect(await screen.findByText(/\$12\.00 available/)).toBeInTheDocument()
  })

  it('quick chip fills the amount', async () => {
    renderTicket()
    await userEvent.click(screen.getByRole('button', { name: '$100' }))
    expect(screen.getByLabelText(/amount/i)).toHaveValue('100')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```powershell
cd dashboard
npx vitest run src/components/OrderTicket.test.tsx
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement OrderTicket**

Create `dashboard/src/components/OrderTicket.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { placeOrder } from '../api/portfolio'
import { formatUnits, formatUsd } from '../lib/format'

type Props = {
  symbol: string
  price: number
  cash: number
  heldUnits: number
}

type Side = 'buy' | 'sell'

const MIN_ORDER_USD = 1
const QUICK_AMOUNTS = [50, 100, 500]

function floorToCents(value: number): number {
  return Math.floor(value * 100) / 100
}

export function OrderTicket({ symbol, price, cash, heldUnits }: Props) {
  const [side, setSide] = useState<Side>('buy')
  const [amount, setAmount] = useState('')
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const heldValue = heldUnits * price
  const parsed = Number(amount)
  const hasAmount = amount.trim() !== ''

  let validationError: string | null = null
  if (hasAmount) {
    if (!Number.isFinite(parsed) || parsed <= 0) {
      validationError = 'Enter a dollar amount.'
    } else if (parsed < MIN_ORDER_USD) {
      validationError = `Minimum order is ${formatUsd(MIN_ORDER_USD)}.`
    } else if (side === 'buy' && parsed > cash) {
      validationError = `Not enough buying power — ${formatUsd(cash)} available.`
    } else if (side === 'sell' && parsed > heldValue) {
      validationError = `You only hold ${formatUsd(heldValue)} of ${symbol}.`
    }
  }
  const inlineError = validationError ?? serverError
  const canReview = hasAmount && !validationError

  const mutation = useMutation({
    mutationFn: placeOrder,
    onSuccess: (order) => {
      setIsReviewOpen(false)
      setAmount('')
      setServerError(null)
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      const verb = order.side === 'buy' ? 'Bought' : 'Sold'
      toast.success(`${verb} ${formatUsd(order.usd_amount)} of ${order.symbol} ✓`, {
        action: { label: 'Portfolio', onClick: () => navigate('/portfolio') },
      })
    },
    onError: (error: Error) => {
      setIsReviewOpen(false)
      setServerError(error.message)
    },
  })

  const maxAmount = side === 'buy' ? floorToCents(cash) : floorToCents(heldValue)
  const setAmountValue = (value: number) => {
    setServerError(null)
    setAmount(String(value))
  }

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Trade {symbol}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
          {(['buy', 'sell'] as Side[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSide(s)
                setServerError(null)
              }}
              className={cn(
                'rounded-md py-1.5 text-sm font-medium capitalize transition-colors duration-200',
                side === s
                  ? s === 'buy'
                    ? 'bg-profit/15 text-profit'
                    : 'bg-loss/15 text-loss'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="order-amount" className="mb-1 block text-xs text-muted-foreground">
            Amount (USD)
          </label>
          <Input
            id="order-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => {
              setServerError(null)
              setAmount(event.target.value)
            }}
          />
          <div className="mt-2 flex gap-1.5">
            {QUICK_AMOUNTS.map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => setAmountValue(quick)}
                className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                ${quick}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAmountValue(maxAmount)}
              className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              Max
            </button>
          </div>
        </div>

        {canReview && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <p>
              Estimated: <span className="text-foreground">{formatUnits(parsed / price)} {symbol}</span>
            </p>
            <p>
              {side === 'buy'
                ? `Buying power after: ${formatUsd(cash - parsed)}`
                : `You'll receive: ${formatUsd(parsed)}`}
            </p>
          </div>
        )}

        {inlineError && <p className="text-xs text-loss">{inlineError}</p>}

        <Button
          disabled={!canReview || mutation.isPending}
          onClick={() => setIsReviewOpen(true)}
          className={cn(
            'w-full transition-transform duration-200 active:scale-[0.98]',
            side === 'buy'
              ? 'bg-profit text-white hover:bg-profit/90'
              : 'bg-loss text-white hover:bg-loss/90',
          )}
        >
          Review order
        </Button>
      </CardContent>

      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {side} {formatUsd(parsed || 0)} of {symbol}
            </DialogTitle>
            <DialogDescription>
              ≈ {formatUnits((parsed || 0) / price)} {symbol} at {formatUsd(price)} — market
              order, filled at the latest cached price.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReviewOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({ symbol, side, usd_amount: parsed })
              }
              className={cn(
                side === 'buy'
                  ? 'bg-profit text-white hover:bg-profit/90'
                  : 'bg-loss text-white hover:bg-loss/90',
              )}
            >
              Confirm {side}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
```

- [ ] **Step 4: Run tests, commit**

```powershell
npx vitest run src/components/OrderTicket.test.tsx
cd ..
git add dashboard/src/components
git commit -m "feat(dashboard): add order ticket with review dialog and inline errors"
```

Expected: PASS (6 tests).

---

### Task 9: AssetPage integration — real ticket + "You own"

**Files:**
- Modify: `dashboard/src/pages/AssetPage.tsx`
- Modify: `dashboard/src/pages/AssetPage.test.tsx`

- [ ] **Step 1: Extend the test**

In `dashboard/src/pages/AssetPage.test.tsx`:

1. Add `vi.mock('../api/portfolio')` and `import * as portfolioApi from '../api/portfolio'`.
2. In `beforeEach`, add:

```tsx
    vi.mocked(portfolioApi.getPortfolio).mockResolvedValue({
      portfolio_id: 'p1', starting_cash: 100000, cash: 99000,
      positions: [{
        symbol: 'BTC', units: 0.01, avg_cost: 60000, price: 64231.5,
        market_value: 642.31, unrealized_pl: 42.31, unrealized_pl_pct: 0.07,
        change_24h_pl: 5,
      }],
      equity: 99642.31, today_pl: 5, total_return_pct: -0.0036,
      stale: false, created_at: '2026-07-30T00:00:00Z',
    })
```

3. Replace the placeholder assertion in the first test — instead of `trading opens soon`, assert the live ticket and ownership stat:

```tsx
    expect(await screen.findByText(/trade btc/i)).toBeInTheDocument()   // OrderTicket header
    expect(screen.getByText(/you own/i)).toBeInTheDocument()
    expect(screen.getByText('$642.31')).toBeInTheDocument()
```

- [ ] **Step 2: Run to verify it fails**

```powershell
cd dashboard
npx vitest run src/pages/AssetPage.test.tsx
```

Expected: FAIL — placeholder card still rendered; no portfolio query.

- [ ] **Step 3: Integrate**

In `dashboard/src/pages/AssetPage.tsx`:

1. Add imports: `getPortfolio` from `../api/portfolio`, `OrderTicket` from `../components/OrderTicket`; remove `Lock` from lucide imports.
2. Add a portfolio query beside the others:

```tsx
  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const position = portfolioQuery.data?.positions.find((p) => p.symbol === symbol)
```

3. Extend the stats row grid from `grid-cols-3` to `grid-cols-4` and add a fourth card after "24h volume":

```tsx
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">You own</p>
                <p className="mt-1 text-sm font-medium tabular-nums">
                  {position ? formatUsd(position.market_value) : '$0.00'}
                </p>
              </CardContent>
            </Card>
```

4. Replace the entire "Trading opens soon" placeholder `<Card>` with:

```tsx
        {quote && portfolioQuery.data ? (
          <OrderTicket
            symbol={symbol}
            price={quote.price}
            cash={portfolioQuery.data.cash}
            heldUnits={position?.units ?? 0}
          />
        ) : (
          <Skeleton className="h-72 w-full rounded-xl" />
        )}
```

- [ ] **Step 4: Run tests, commit**

```powershell
npx vitest run src/pages/AssetPage.test.tsx
cd ..
git add dashboard/src/pages
git commit -m "feat(dashboard): wire live order ticket and ownership into trade view"
```

Expected: PASS.

---

### Task 10: PositionsTable + PortfolioPage

**Files:**
- Create: `dashboard/src/components/PositionsTable.tsx`
- Create: `dashboard/src/pages/PortfolioPage.tsx`
- Test: `dashboard/src/pages/PortfolioPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/pages/PortfolioPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PortfolioPage } from './PortfolioPage'
import * as portfolioApi from '../api/portfolio'
import type { Position } from '../types'

vi.mock('../api/portfolio')

function position(symbol: string, marketValue: number): Position {
  return {
    symbol, units: 1, avg_cost: 100, price: marketValue,
    market_value: marketValue, unrealized_pl: marketValue - 100,
    unrealized_pl_pct: (marketValue - 100) / 100, change_24h_pl: 1,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PortfolioPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PortfolioPage', () => {
  beforeEach(() => {
    vi.mocked(portfolioApi.getPortfolio).mockResolvedValue({
      portfolio_id: 'p1', starting_cash: 100000, cash: 99000,
      positions: [position('BTC', 500), position('ETH', 900)],
      equity: 100400, today_pl: 2, total_return_pct: 0.004,
      stale: false, created_at: '2026-07-30T00:00:00Z',
    })
    vi.mocked(portfolioApi.getPortfolioOrders).mockResolvedValue([
      { id: 'o2', symbol: 'ETH', side: 'sell', usd_amount: 100, units: 10,
        fill_price: 10, created_at: '2026-07-30T11:00:00Z' },
      { id: 'o1', symbol: 'BTC', side: 'buy', usd_amount: 250, units: 2.5,
        fill_price: 100, created_at: '2026-07-30T10:00:00Z' },
    ])
  })

  it('renders positions in the default tab', async () => {
    renderPage()
    expect(await screen.findByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
  })

  it('defaults to market value descending and toggles on header click', async () => {
    renderPage()
    await screen.findByText('BTC')
    let rows = screen.getAllByTestId('position-row')
    expect(within(rows[0]).getByText('ETH')).toBeInTheDocument() // 900 > 500 desc default
    await userEvent.click(screen.getByRole('button', { name: /market value/i }))
    rows = screen.getAllByTestId('position-row')
    expect(within(rows[0]).getByText('BTC')).toBeInTheDocument() // toggled to ascending
  })

  it('shows order history in the Orders tab', async () => {
    renderPage()
    await screen.findByText('BTC')
    await userEvent.click(screen.getByRole('tab', { name: /orders/i }))
    expect(await screen.findByText(/sold \$100\.00 of eth/i)).toBeInTheDocument()
  })

  it('shows the activity timeline in the Activity tab', async () => {
    renderPage()
    await screen.findByText('BTC')
    await userEvent.click(screen.getByRole('tab', { name: /activity/i }))
    expect(await screen.findByText(/bought \$250\.00 of btc/i)).toBeInTheDocument()
  })

  it('shows a designed empty state without positions', async () => {
    vi.mocked(portfolioApi.getPortfolio).mockResolvedValue({
      portfolio_id: 'p1', starting_cash: 100000, cash: 100000, positions: [],
      equity: 100000, today_pl: 0, total_return_pct: 0,
      stale: false, created_at: '2026-07-30T00:00:00Z',
    })
    renderPage()
    expect(
      await screen.findByText(/don't own any coins yet/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /explore markets/i })).toHaveAttribute(
      'href', '/markets',
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```powershell
cd dashboard
npx vitest run src/pages/PortfolioPage.test.tsx
```

Expected: FAIL — modules missing.

- [ ] **Step 3: Implement PositionsTable**

Create `dashboard/src/components/PositionsTable.tsx`:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPct, formatUnits, formatUsd } from '../lib/format'
import { CoinIcon } from './CoinIcon'
import type { Position } from '../types'

type SortKey = 'symbol' | 'market_value' | 'unrealized_pl' | 'change_24h_pl'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'symbol', label: 'Coin' },
  { key: 'market_value', label: 'Market value' },
  { key: 'unrealized_pl', label: 'Total return' },
  { key: 'change_24h_pl', label: 'Today' },
]

export function PositionsTable({ positions }: { positions: Position[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('market_value')
  const [isDescending, setIsDescending] = useState(true)

  const sorted = [...positions].sort((a, b) => {
    const delta =
      sortKey === 'symbol'
        ? a.symbol.localeCompare(b.symbol)
        : a[sortKey] - b[sortKey]
    return isDescending ? -delta : delta
  })

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setIsDescending((d) => !d)
    } else {
      setSortKey(key)
      setIsDescending(true)
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-border px-3 pb-2">
        {COLUMNS.map((column) => (
          <button
            key={column.key}
            type="button"
            onClick={() => handleSort(column.key)}
            className={cn(
              'flex items-center gap-1 text-left text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground',
              column.key !== 'symbol' && 'justify-end text-right',
            )}
          >
            {column.label}
            <ArrowUpDown className="size-3" aria-hidden="true" />
          </button>
        ))}
      </div>
      {sorted.map((p) => {
        const isUp = p.unrealized_pl >= 0
        const isUpToday = p.change_24h_pl >= 0
        return (
          <Link
            key={p.symbol}
            to={`/coins/${p.symbol}`}
            data-testid="position-row"
            className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-2 rounded-lg px-3 py-2.5 transition-colors duration-200 hover:bg-card"
          >
            <div className="flex items-center gap-3">
              <CoinIcon symbol={p.symbol} className="size-8 text-[10px]" />
              <div>
                <p className="text-sm font-medium">{p.symbol}</p>
                <p className="text-xs text-muted-foreground">
                  {formatUnits(p.units)} @ {formatUsd(p.avg_cost)}
                </p>
              </div>
            </div>
            <p className="text-right text-sm tabular-nums">{formatUsd(p.market_value)}</p>
            <div className="text-right">
              <p className={cn('text-sm tabular-nums', isUp ? 'text-profit' : 'text-loss')}>
                {formatUsd(p.unrealized_pl)}
              </p>
              <p className={cn('text-xs tabular-nums', isUp ? 'text-profit' : 'text-loss')}>
                {formatPct(p.unrealized_pl_pct)}
              </p>
            </div>
            <p
              className={cn(
                'text-right text-sm tabular-nums',
                isUpToday ? 'text-profit' : 'text-loss',
              )}
            >
              {formatUsd(p.change_24h_pl)}
            </p>
          </Link>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Implement PortfolioPage**

Create `dashboard/src/pages/PortfolioPage.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { getPortfolio, getPortfolioOrders } from '../api/portfolio'
import { PositionsTable } from '../components/PositionsTable'
import { StalePricesBanner } from '../components/StalePricesBanner'
import { formatUnits, formatUsd } from '../lib/format'
import type { ManualOrder } from '../types'

const POLL_INTERVAL_MS = 30_000

function orderText(order: ManualOrder): string {
  const verb = order.side === 'buy' ? 'Bought' : 'Sold'
  return `${verb} ${formatUsd(order.usd_amount)} of ${order.symbol}`
}

function OrderLine({ order }: { order: ManualOrder }) {
  const Icon = order.side === 'buy' ? ArrowDownCircle : ArrowUpCircle
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
      <Icon
        className={cn('size-5', order.side === 'buy' ? 'text-profit' : 'text-loss')}
        aria-hidden="true"
      />
      <div className="flex-1">
        <p className="text-sm">{orderText(order)}</p>
        <p className="text-xs text-muted-foreground">
          {formatUnits(order.units)} @ {formatUsd(order.fill_price)} ·{' '}
          {new Date(order.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card">
        <Wallet className="size-6 text-primary" aria-hidden="true" />
      </div>
      <p className="text-sm text-muted-foreground">
        You don't own any coins yet — find your first one in Markets.
      </p>
      <Button asChild variant="outline">
        <Link to="/markets">Explore Markets</Link>
      </Button>
    </div>
  )
}

export function PortfolioPage() {
  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const ordersQuery = useQuery({
    queryKey: ['portfolio', 'orders'],
    queryFn: getPortfolioOrders,
  })

  const portfolio = portfolioQuery.data
  const orders = ordersQuery.data ?? []

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Portfolio</h1>
      {portfolio?.stale && <StalePricesBanner />}

      {portfolioQuery.isLoading && <Skeleton className="h-64 w-full rounded-xl" />}

      {portfolio && (
        <Tabs defaultValue="positions">
          <TabsList>
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="positions" className="mt-4">
            {portfolio.positions.length === 0 ? (
              <EmptyState />
            ) : (
              <PositionsTable positions={portfolio.positions} />
            )}
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            {orders.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No orders yet.
              </p>
            ) : (
              orders.map((order) => <OrderLine key={order.id} order={order} />)
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            {orders.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Your trades will show up here.
              </p>
            ) : (
              <div className="flex flex-col gap-1 border-l border-border pl-4">
                {orders.map((order) => (
                  <OrderLine key={order.id} order={order} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run tests, commit**

```powershell
npx vitest run src/pages/PortfolioPage.test.tsx
cd ..
git add dashboard/src
git commit -m "feat(dashboard): add portfolio page with positions, orders, and activity"
```

Expected: PASS (5 tests).

---

### Task 11: PortfolioEquityChart + DashboardPage

**Files:**
- Create: `dashboard/src/components/PortfolioEquityChart.tsx`
- Create: `dashboard/src/pages/DashboardPage.tsx`
- Test: `dashboard/src/pages/DashboardPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/pages/DashboardPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from './DashboardPage'
import * as portfolioApi from '../api/portfolio'
import * as marketApi from '../api/market'
import * as watchlistApi from '../api/watchlist'

vi.mock('../api/portfolio')
vi.mock('../api/market')
vi.mock('../api/watchlist')

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(portfolioApi.getPortfolio).mockResolvedValue({
      portfolio_id: 'p1', starting_cash: 100000, cash: 55000,
      positions: [{
        symbol: 'BTC', units: 0.5, avg_cost: 60000, price: 64000,
        market_value: 32000, unrealized_pl: 2000, unrealized_pl_pct: 0.0667,
        change_24h_pl: 150,
      }],
      equity: 87000, today_pl: 150, total_return_pct: -0.13,
      stale: false, created_at: '2026-07-30T00:00:00Z',
    })
    vi.mocked(portfolioApi.getPortfolioEquity).mockResolvedValue({
      range: '1M',
      points: [
        { ts: '2026-07-29T00:00:00Z', equity: 86000 },
        { ts: '2026-07-30T00:00:00Z', equity: 87000 },
      ],
    })
    vi.mocked(marketApi.getMarketAssets).mockResolvedValue({
      assets: [
        { symbol: 'BTC', name: 'Bitcoin', price: 64000, change_24h_pct: 0.01,
          high_24h: 0, low_24h: 0, volume_24h: 0, sparkline: [63000, 64000] },
        { symbol: 'ETH', name: 'Ethereum', price: 3400, change_24h_pct: -0.02,
          high_24h: 0, low_24h: 0, volume_24h: 0, sparkline: [3500, 3400] },
      ],
      stale: false, as_of: '2026-07-30T12:00:00Z',
    })
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue({ symbols: ['ETH'] })
  })

  it('renders the four hero stat cards', async () => {
    renderPage()
    expect(await screen.findByText('Portfolio Value')).toBeInTheDocument()
    expect(screen.getByText('$87,000.00')).toBeInTheDocument()
    expect(screen.getByText("Today's P/L")).toBeInTheDocument()
    expect(screen.getByText('Total Return')).toBeInTheDocument()
    expect(screen.getByText('Buying Power')).toBeInTheDocument()
    expect(screen.getByText('$55,000.00')).toBeInTheDocument()
  })

  it('lists holdings under Your coins', async () => {
    renderPage()
    expect(await screen.findByText('Your coins')).toBeInTheDocument()
    expect(screen.getByText('$32,000.00')).toBeInTheDocument()
  })

  it('shows watchlist entries', async () => {
    renderPage()
    expect(await screen.findByText('Watchlist')).toBeInTheDocument()
    // "Ethereum" also appears in the market overview cards
    expect((await screen.findAllByText('Ethereum')).length).toBeGreaterThan(0)
  })

  it('shows market overview cards', async () => {
    renderPage()
    expect(await screen.findByText('Market overview')).toBeInTheDocument()
    expect(screen.getAllByText('Bitcoin').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```powershell
cd dashboard
npx vitest run src/pages/DashboardPage.test.tsx
```

Expected: FAIL — modules missing.

- [ ] **Step 3: Implement the equity chart**

Create `dashboard/src/components/PortfolioEquityChart.tsx`:

```tsx
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import type { EquityRange, ManualEquityPoint } from '../types'

const RANGES: EquityRange[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL']

type Props = {
  points: ManualEquityPoint[]
  range: EquityRange
  onRangeChange: (range: EquityRange) => void
}

export function PortfolioEquityChart({ points, range, onRangeChange }: Props) {
  const data = points.map((point) => ({
    ts: new Date(point.ts).toLocaleDateString(),
    equity: point.equity,
  }))
  return (
    <div>
      <div className="mb-2 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            onClick={() => onRangeChange(r)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200',
              range === r
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="ts" stroke="#8b93a7" minTickGap={60} fontSize={11} />
          <YAxis stroke="#8b93a7" domain={['auto', 'auto']} width={70} fontSize={11} />
          <Tooltip
            contentStyle={{ background: '#161925', border: '1px solid #232838' }}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#equityFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: Implement DashboardPage**

Create `dashboard/src/pages/DashboardPage.tsx`:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getMarketAssets } from '../api/market'
import { getPortfolio, getPortfolioEquity } from '../api/portfolio'
import { useWatchlist } from '../hooks/useWatchlist'
import { CoinIcon } from '../components/CoinIcon'
import { MarketCard } from '../components/MarketCard'
import { PortfolioEquityChart } from '../components/PortfolioEquityChart'
import { StalePricesBanner } from '../components/StalePricesBanner'
import { StatCard } from '../components/StatCard'
import { formatPct, formatUsd } from '../lib/format'
import type { EquityRange } from '../types'

const POLL_INTERVAL_MS = 30_000
const OVERVIEW_COUNT = 4

export function DashboardPage() {
  const [range, setRange] = useState<EquityRange>('1M')
  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const equityQuery = useQuery({
    queryKey: ['portfolio', 'equity', range],
    queryFn: () => getPortfolioEquity(range),
    refetchInterval: POLL_INTERVAL_MS,
  })
  const marketQuery = useQuery({
    queryKey: ['market-assets'],
    queryFn: getMarketAssets,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const { starred } = useWatchlist()

  const portfolio = portfolioQuery.data
  const assets = marketQuery.data?.assets ?? []
  const watchlistAssets = assets.filter((asset) => starred.has(asset.symbol))

  return (
    <div>
      <h1 className="sr-only">Dashboard</h1>
      {portfolio?.stale && <StalePricesBanner />}

      {portfolio ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Portfolio Value" value={formatUsd(portfolio.equity)} />
          <StatCard
            label="Today's P/L"
            value={formatUsd(portfolio.today_pl)}
            tone={portfolio.today_pl >= 0 ? 'profit' : 'loss'}
          />
          <StatCard
            label="Total Return"
            value={formatPct(portfolio.total_return_pct)}
            tone={portfolio.total_return_pct >= 0 ? 'profit' : 'loss'}
          />
          <StatCard label="Buying Power" value={formatUsd(portfolio.cash)} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="p-4">
              {equityQuery.data ? (
                <PortfolioEquityChart
                  points={equityQuery.data.points}
                  range={range}
                  onRangeChange={setRange}
                />
              ) : (
                <Skeleton className="h-64 w-full" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your coins</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 p-3 pt-0">
              {portfolio && portfolio.positions.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  You don't own any coins yet —{' '}
                  <Link to="/markets" className="text-primary hover:underline">
                    explore Markets
                  </Link>
                  .
                </p>
              )}
              {portfolio?.positions.map((p) => (
                <Link
                  key={p.symbol}
                  to={`/coins/${p.symbol}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-accent"
                >
                  <CoinIcon symbol={p.symbol} className="size-8 text-[10px]" />
                  <span className="flex-1 text-sm font-medium">{p.symbol}</span>
                  <span className="text-sm tabular-nums">{formatUsd(p.market_value)}</span>
                  <span
                    className={cn(
                      'w-20 text-right text-xs tabular-nums',
                      p.unrealized_pl >= 0 ? 'text-profit' : 'text-loss',
                    )}
                  >
                    {formatPct(p.unrealized_pl_pct)}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Watchlist</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 p-3 pt-0">
              {watchlistAssets.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Star coins in Markets to track them here.
                </p>
              )}
              {watchlistAssets.map((asset) => (
                <Link
                  key={asset.symbol}
                  to={`/coins/${asset.symbol}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-accent"
                >
                  <CoinIcon symbol={asset.symbol} className="size-7 text-[10px]" />
                  <span className="flex-1 truncate text-sm">{asset.name}</span>
                  <span className="text-xs tabular-nums">{formatUsd(asset.price)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              Market overview
            </h2>
            <div className="flex flex-col gap-2">
              {assets.slice(0, OVERVIEW_COUNT).map((asset) => (
                <MarketCard key={asset.symbol} asset={asset} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

Note: the page `h1` is screen-reader-only ("Dashboard") — the routing test anchors on it.

- [ ] **Step 5: Run tests, commit**

```powershell
npx vitest run src/pages/DashboardPage.test.tsx
cd ..
git add dashboard/src
git commit -m "feat(dashboard): real dashboard with stat cards, equity chart, and holdings"
```

Expected: PASS (4 tests).

---

### Task 12: TopBar portfolio chip + final route wiring

**Files:**
- Modify: `dashboard/src/layout/TopBar.tsx` + `TopBar.test.tsx`
- Modify: `dashboard/src/App.tsx` + `App.test.tsx`

- [ ] **Step 1: Extend the TopBar test**

In `dashboard/src/layout/TopBar.test.tsx`, add `vi.mock('../api/portfolio')`, `import * as portfolioApi from '../api/portfolio'`, and in `beforeEach`:

```tsx
    vi.mocked(portfolioApi.getPortfolio).mockResolvedValue({
      portfolio_id: 'p1', starting_cash: 100000, cash: 55000, positions: [],
      equity: 87000, today_pl: 150, total_return_pct: -0.13,
      stale: false, created_at: '2026-07-30T00:00:00Z',
    })
```

Add a test:

```tsx
  it("shows the portfolio value chip with today's P/L", async () => {
    renderBar()
    expect(await screen.findByText('$87,000.00')).toBeInTheDocument()
    expect(screen.getByText('+$150.00')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify it fails, then implement the chip**

```powershell
cd dashboard
npx vitest run src/layout/TopBar.test.tsx
```

Expected: FAIL. Then in `dashboard/src/layout/TopBar.tsx`:

1. Add imports: `Link` from react-router-dom, `getPortfolio` from `../api/portfolio`, `cn` from `@/lib/utils`.
2. Add beside the market query:

```tsx
  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
    refetchInterval: 30_000,
  })
  const portfolio = portfolioQuery.data
```

3. Inside the trailing `<div className="ml-auto …">`, before the Bell, add:

```tsx
        {portfolio && (
          <Link
            to="/portfolio"
            className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 sm:flex"
          >
            <span className="text-xs font-medium tabular-nums">
              {formatUsd(portfolio.equity)}
            </span>
            <span
              className={cn(
                'text-xs tabular-nums',
                portfolio.today_pl >= 0 ? 'text-profit' : 'text-loss',
              )}
            >
              {portfolio.today_pl >= 0 ? '+' : ''}
              {formatUsd(portfolio.today_pl)}
            </span>
          </Link>
        )}
```

Re-run — expected PASS.

- [ ] **Step 3: Wire Dashboard + Portfolio routes**

In `dashboard/src/App.tsx`:

1. Add imports for `DashboardPage` and `PortfolioPage`; remove now-unused lucide icons (`LayoutDashboard`, `Wallet`) from the import.
2. Replace the `/` ComingSoon route with `<Route path="/" element={<DashboardPage />} />`.
3. Replace the `/portfolio` ComingSoon route with `<Route path="/portfolio" element={<PortfolioPage />} />`.
4. Update the Settings ComingSoon `description` to: `"Portfolio reset, starting cash, and advisor controls arrive in the final phase."`
5. In `dashboard/src/App.test.tsx`, the `'renders the Dashboard placeholder at /'` test still passes — DashboardPage renders an sr-only `h1` named "Dashboard". Add:

```tsx
  it('renders the Portfolio page at /portfolio', () => {
    renderAt('/portfolio')
    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument()
  })
```

- [ ] **Step 4: Full suite + build, commit**

```powershell
npm test
npm run build
cd ..
git add dashboard/src
git commit -m "feat(dashboard): portfolio chip in top bar and live dashboard/portfolio routes"
```

Expected: all tests PASS; build clean.

---

### Task 13: Manual smoke check + phase wrap-up

**Files:** none (verification only). Controller-driven — run in the main session, not a subagent.

- [ ] **Step 1: Migrate + start servers**

```powershell
alembic upgrade head
uvicorn hedgefund.api.app:app --reload
# terminal 2
cd dashboard; npm run dev
```

Open http://localhost:5173 and verify:

1. `/` shows four stat cards seeded at $100k, empty-state holdings, watchlist widget, market overview.
2. Trade view → Buy $100 of BTC → Review dialog → Confirm → toast with Portfolio link; stat cards, chip, and "You own" update within one poll.
3. Buy more than your cash → inline red message in the ticket, CTA disabled; no toast.
4. Sell flow: sell part of the position; sell more than held → inline error.
5. `/portfolio`: position row with correct units/avg cost; Orders tab newest-first; Activity timeline shows the trades.
6. Top bar chip always visible with value + today's P/L, links to `/portfolio`.
7. Reload survives everything (DB-backed); `/lab/*` pages untouched.
8. No console errors.

- [ ] **Step 2: Fix anything found, re-run suites, commit fixes**

```powershell
python -m pytest
cd dashboard; npm test; npm run build
git add -A
git commit -m "fix(dashboard): phase 3 smoke-check fixes"
```

(Skip if clean.)

- [ ] **Step 3: Done — phase exit criteria**

- A first-time user can buy a coin in under a minute: Dashboard → Markets/search → Trade view → $ amount → Review → Confirm (spec success criterion).
- Cash/positions always derived from orders; order math covered by dense pytest units.
- Every data surface has skeleton, empty, and stale/error states.
- Backend + frontend suites green; production build green.

Next: Phase 4 (Advisor) gets its own plan; then Phase 5 (Leaderboard + News + Settings + limit-order revisit).
