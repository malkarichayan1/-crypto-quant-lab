from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from hedgefund.api.app import create_app
from hedgefund.api.db.engine import get_session
from hedgefund.api.db.models import Base
from hedgefund.api.db import agent_models as _  # noqa: F401
from hedgefund.api.deps import get_call_llm, get_panel_loader
from tests.fixtures.panels import single_asset_panel

import os
_TEST_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test",
)


@pytest.fixture(scope="session")
def ar_engine():
    eng = create_engine(_TEST_URL, future=True)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def ar_session(ar_engine):
    conn = ar_engine.connect()
    trans = conn.begin()
    Sess = sessionmaker(bind=conn, autoflush=False, expire_on_commit=False)
    sess = Sess()
    try:
        yield sess
    finally:
        sess.close()
        trans.rollback()
        conn.close()


@pytest.fixture
def ar_client(ar_session):
    app = create_app()

    def _override_session():
        yield ar_session

    def _override_loader():
        return lambda symbols, start, end: single_asset_panel(
            [100.0, 110.0, 121.0, 133.1, 146.41, 161.05]
        )

    def _override_llm():
        return lambda messages, model="x", max_tokens=2048: ("mock response", 0.001)

    app.dependency_overrides[get_session] = _override_session
    app.dependency_overrides[get_panel_loader] = _override_loader
    app.dependency_overrides[get_call_llm] = _override_llm
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


_BODY = {
    "goal": "maximize sharpe ratio",
    "universe": ["BTC/USDT"],
    "date_start": "2022-01-01",
    "date_end": "2022-06-30",
    "starting_cash": 10000,
    "budget_usd": 1.0,
    "target_metric": "sharpe",
    "target_value": 1.5,
}


def test_create_agent_run_returns_202(ar_client):
    res = ar_client.post("/agent-runs", json=_BODY)
    assert res.status_code == 202
    data = res.json()
    assert data["goal"] == "maximize sharpe ratio"
    assert data["status"] == "pending"
    assert "id" in data


def test_list_agent_runs(ar_client):
    ar_client.post("/agent-runs", json=_BODY)
    res = ar_client.get("/agent-runs")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_get_agent_run_not_found(ar_client):
    res = ar_client.get(f"/agent-runs/{uuid.uuid4()}")
    assert res.status_code == 404


def test_get_agent_run_by_id(ar_client):
    create_res = ar_client.post("/agent-runs", json=_BODY)
    run_id = create_res.json()["id"]
    res = ar_client.get(f"/agent-runs/{run_id}")
    assert res.status_code == 200
    assert res.json()["id"] == run_id
    assert "iterations" in res.json()
