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
