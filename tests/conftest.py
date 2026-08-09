from __future__ import annotations

import pytest


@pytest.fixture
def market_data():
    from tests.fixtures.market import FakeMarketData

    return FakeMarketData()
