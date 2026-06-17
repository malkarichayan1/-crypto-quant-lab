from __future__ import annotations

import asyncio
import os
import uuid
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from hedgefund.agents.runner import run_agent_loop
from hedgefund.api.db.models import Base
from hedgefund.api.db import agent_models as _  # noqa: F401
from hedgefund.api.db.agent_repository import AgentRepository

_TEST_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test",
)


@pytest.fixture(scope="session")
def runner_engine():
    eng = create_engine(_TEST_URL, future=True)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def session_factory(runner_engine):
    return sessionmaker(bind=runner_engine, autoflush=False, expire_on_commit=False)


@pytest.mark.asyncio
async def test_runner_budget_zero_exits_immediately(session_factory, runner_engine):
    """With budget=0, loop exits before the first iteration after run_started."""
    sess = session_factory()
    repo = AgentRepository(sess)
    run = repo.create_run(
        goal="test",
        universe=["BTC/USDT"],
        date_start=date(2022, 1, 1),
        date_end=date(2022, 6, 30),
        starting_cash=10000.0,
        budget_usd=0.0,
        target_metric=None,
        target_value=None,
        model="claude-sonnet-4-6",
    )
    sess.commit()
    sess.refresh(run)
    run_id = run.id
    sess.close()

    def mock_llm(messages, model="x", max_tokens=2048):
        return "mock", 0.001

    from tests.fixtures.panels import single_asset_panel

    def mock_loader(symbols, start, end):
        return single_asset_panel([100.0, 110.0, 121.0, 133.1, 146.41, 161.05])

    queue: asyncio.Queue = asyncio.Queue()
    await run_agent_loop(
        run_id=run_id,
        goal="test",
        universe=["BTC/USDT"],
        date_start="2022-01-01",
        date_end="2022-06-30",
        starting_cash=10000.0,
        budget_usd=0.0,
        target_metric=None,
        target_value=None,
        model="claude-sonnet-4-6",
        call_llm=mock_llm,
        session_factory=session_factory,
        panel_loader=mock_loader,
        event_queue=queue,
    )

    events = []
    while not queue.empty():
        item = queue.get_nowait()
        if item is not None:
            events.append(item)

    types = [e["type"] for e in events]
    assert "run_started" in types
    assert "run_done" in types
    done_event = next(e for e in events if e["type"] == "run_done")
    assert done_event["status"] == "done"
