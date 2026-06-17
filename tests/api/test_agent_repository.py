from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from hedgefund.api.db.agent_repository import AgentRepository
from hedgefund.api.db.models import Base
from hedgefund.api.db import agent_models as _  # noqa: F401

import os
_TEST_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test",
)


@pytest.fixture(scope="session")
def agent_engine():
    eng = create_engine(_TEST_URL, future=True)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def agent_session(agent_engine):
    conn = agent_engine.connect()
    trans = conn.begin()
    Sess = sessionmaker(bind=conn, autoflush=False, expire_on_commit=False)
    sess = Sess()
    try:
        yield sess
    finally:
        sess.close()
        trans.rollback()
        conn.close()


def _run_kwargs():
    return dict(
        goal="maximize sharpe",
        universe=["BTC/USDT"],
        date_start=date(2022, 1, 1),
        date_end=date(2023, 12, 31),
        starting_cash=10000.0,
        budget_usd=1.0,
        target_metric="sharpe",
        target_value=1.5,
        model="claude-sonnet-4-6",
    )


def test_create_and_get_run(agent_session):
    repo = AgentRepository(agent_session)
    run = repo.create_run(**_run_kwargs())
    agent_session.commit()
    agent_session.refresh(run)

    fetched = repo.get_run(run.id)
    assert fetched is not None
    assert fetched.goal == "maximize sharpe"
    assert fetched.status == "pending"


def test_list_runs(agent_session):
    repo = AgentRepository(agent_session)
    repo.create_run(**_run_kwargs())
    repo.create_run(**_run_kwargs())
    agent_session.commit()
    runs = repo.list_runs()
    assert len(runs) >= 2


def test_update_run_status(agent_session):
    repo = AgentRepository(agent_session)
    run = repo.create_run(**_run_kwargs())
    agent_session.commit()
    agent_session.refresh(run)

    repo.update_run_status(run.id, "running")
    agent_session.commit()
    agent_session.refresh(run)
    assert run.status == "running"


def test_create_iteration(agent_session):
    repo = AgentRepository(agent_session)
    run = repo.create_run(**_run_kwargs())
    agent_session.commit()
    agent_session.refresh(run)

    it = repo.create_iteration(
        run_id=run.id,
        iteration_index=0,
        research_note="use momentum",
        spec_json={"name": "test"},
        backtest_id=None,
        metrics_snapshot={"sharpe": 0.5},
        critic_note="not good enough",
        failed=False,
    )
    agent_session.commit()
    agent_session.refresh(it)
    assert it.iteration_index == 0
    assert it.metrics_snapshot["sharpe"] == 0.5


def test_list_iterations(agent_session):
    repo = AgentRepository(agent_session)
    run = repo.create_run(**_run_kwargs())
    agent_session.commit()
    agent_session.refresh(run)

    repo.create_iteration(run_id=run.id, iteration_index=0, research_note="r",
                          spec_json=None, backtest_id=None, metrics_snapshot=None,
                          critic_note="c", failed=True)
    agent_session.commit()
    iters = repo.list_iterations(run.id)
    assert len(iters) == 1
