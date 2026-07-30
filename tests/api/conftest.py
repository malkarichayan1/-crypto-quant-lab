from __future__ import annotations

import os

os.environ.setdefault("PAPER_TICKER_ENABLED", "0")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from hedgefund.api.app import create_app
from hedgefund.api.db.engine import get_session
from hedgefund.api.db.models import Base
from hedgefund.api.deps import get_panel_loader
from tests.fixtures.panels import single_asset_panel

_TEST_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test",
)


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(_TEST_URL, future=True)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def session(engine):
    """A session bound to a transaction that is rolled back after each test."""
    connection = engine.connect()
    trans = connection.begin()
    TestSession = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)
    sess = TestSession()
    try:
        yield sess
    finally:
        sess.close()
        trans.rollback()
        connection.close()


@pytest.fixture
def market_data():
    from tests.fixtures.market import FakeMarketData

    return FakeMarketData()


@pytest.fixture
def client(session, market_data):
    app = create_app()

    def _override_session():
        yield session

    def _override_loader():
        def _load(symbols, start, end):
            # 6 ascending daily closes from 2020-01-01, symbol "AAA"
            return single_asset_panel([100.0, 110.0, 121.0, 133.1, 146.41, 161.05])

        return _load

    from hedgefund.api.deps import get_market_data

    app.dependency_overrides[get_session] = _override_session
    app.dependency_overrides[get_panel_loader] = _override_loader
    app.dependency_overrides[get_market_data] = lambda: market_data
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
