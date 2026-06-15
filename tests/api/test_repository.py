import uuid

from hedgefund.api.db.repository import BacktestRepository


def _row_kwargs(name="t"):
    return dict(
        name=name,
        spec={"name": name},
        equity_curve=[["2020-01-01", 100.0], ["2020-01-02", 110.0]],
        benchmark_curve=None,
        trade_log=[{"date": "2020-01-02", "symbol": "AAA", "units": 1.0, "price": 100.0}],
        metrics={"sharpe": 1.0, "total_return": 0.1},
        starting_cash=10_000.0,
        duration_ms=7,
    )


def test_create_returns_row_with_id_and_created_at(session):
    repo = BacktestRepository(session)
    row = repo.create(**_row_kwargs())
    assert isinstance(row.id, uuid.UUID)
    assert row.created_at is not None
    assert row.name == "t"


def test_get_returns_created_row(session):
    repo = BacktestRepository(session)
    created = repo.create(**_row_kwargs())
    fetched = repo.get(created.id)
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.metrics["sharpe"] == 1.0


def test_get_missing_returns_none(session):
    repo = BacktestRepository(session)
    assert repo.get(uuid.uuid4()) is None


def test_list_returns_all(session):
    repo = BacktestRepository(session)
    repo.create(**_row_kwargs(name="a"))
    repo.create(**_row_kwargs(name="b"))
    rows = repo.list()
    assert {r.name for r in rows} == {"a", "b"}


def test_delete_removes_row(session):
    repo = BacktestRepository(session)
    created = repo.create(**_row_kwargs())
    assert repo.delete(created.id) is True
    assert repo.get(created.id) is None


def test_delete_missing_returns_false(session):
    repo = BacktestRepository(session)
    assert repo.delete(uuid.uuid4()) is False
