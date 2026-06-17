import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from hedgefund.api.db.models import Base
from hedgefund.api.db.paper_repository import PaperRepository

TEST_DB = "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test"


@pytest.fixture
def session():
    engine = create_engine(TEST_DB)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.rollback()
    s.close()
    Base.metadata.drop_all(engine)


def _spec_json():
    return {"name": "x", "universe": ["BTC/USDT"], "indicators": [],
            "selection": {"mode": "time_series",
                          "entry": {"indicator_id": "s", "op": ">", "value": 0},
                          "exit": {"indicator_id": "s", "op": "<", "value": 0}},
            "start": "2026-06-17", "end": "2026-06-18"}


def _state_json():
    return {"cash": 10_000.0, "positions": {}, "pending_target": None,
            "ts_state": {}, "prev_ts": None, "last_processed_ts": None}


def test_create_and_get_session(session):
    repo = PaperRepository(session)
    row = repo.create_session(
        label="t", spec_json=_spec_json(), source_backtest_id=None,
        universe=["BTC/USDT"], timeframe="1h", starting_cash=10_000.0,
        state_json=_state_json(),
    )
    session.commit()
    got = repo.get_session(row.id)
    assert got is not None and got.label == "t" and got.status == "active"


def test_list_active_sessions_excludes_stopped(session):
    repo = PaperRepository(session)
    a = repo.create_session(label="a", spec_json=_spec_json(), source_backtest_id=None,
                            universe=["BTC/USDT"], timeframe="1h", starting_cash=1.0,
                            state_json=_state_json())
    b = repo.create_session(label="b", spec_json=_spec_json(), source_backtest_id=None,
                            universe=["BTC/USDT"], timeframe="1h", starting_cash=1.0,
                            state_json=_state_json())
    session.commit()
    repo.stop_session(b.id)
    session.commit()
    active_ids = {s.id for s in repo.list_active_sessions()}
    assert a.id in active_ids and b.id not in active_ids


def test_record_tick_persists_state_trades_equity(session):
    repo = PaperRepository(session)
    row = repo.create_session(label="t", spec_json=_spec_json(), source_backtest_id=None,
                             universe=["BTC/USDT"], timeframe="1h", starting_cash=10_000.0,
                             state_json=_state_json())
    session.commit()
    ts = datetime(2026, 6, 17, 1, tzinfo=timezone.utc)
    repo.record_tick(
        session_id=row.id,
        state_json={"cash": 0.0, "positions": {"BTC/USDT": 1.0}},
        fills=[{"symbol": "BTC/USDT", "units": 1.0, "price": 100.0}],
        equity=10_000.0, ts=ts, is_catchup=True,
    )
    session.commit()
    trades = repo.list_trades(row.id)
    equity = repo.list_equity(row.id)
    refreshed = repo.get_session(row.id)
    assert len(trades) == 1 and trades[0].is_catchup is True
    assert len(equity) == 1 and equity[0].equity == 10_000.0
    assert refreshed.state_json["cash"] == 0.0
    assert refreshed.last_processed_ts is not None


def test_set_error_marks_session(session):
    repo = PaperRepository(session)
    row = repo.create_session(label="t", spec_json=_spec_json(), source_backtest_id=None,
                             universe=["BTC/USDT"], timeframe="1h", starting_cash=1.0,
                             state_json=_state_json())
    session.commit()
    repo.set_error(row.id, "boom")
    session.commit()
    got = repo.get_session(row.id)
    assert got.status == "error" and got.error == "boom"
