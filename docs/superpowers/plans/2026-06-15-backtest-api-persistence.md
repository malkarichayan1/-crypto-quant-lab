# Backtest API + Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing deterministic backtest engine over a synchronous FastAPI REST API that persists every run to Postgres and serves stored results for the upcoming React dashboard.

**Architecture:** A new `hedgefund/api/` package layered as routes → repository → SQLAlchemy 2.0 ORM → Postgres. Routes call the same `validate_spec` / `run_backtest` / `summarize` functions the CLI uses; the price panel is loaded through an injectable dependency so tests run against synthetic panels with no market data. All variable-length result data (curves, trade log, metrics, spec) is stored as JSONB in a single `backtests` table managed by Alembic.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (sync), Alembic, Postgres 16 (via docker-compose), psycopg 3, python-dotenv, pytest + httpx TestClient.

**Spec:** `docs/superpowers/specs/2026-06-15-backtest-api-persistence-design.md`

**Conventions for every task below:**
- Interpreter: all `pytest`/`python`/`alembic` commands run via `.venv/Scripts/python.exe -m ...` (the system Python lacks the project dependencies). Example: `.venv/Scripts/python.exe -m pytest tests/api/test_repository.py -v`.
- A local Postgres must be running for DB-touching tests (`docker-compose up -d db`). `TEST_DATABASE_URL` points at the `hedgefund_test` database.
- `summarize()` returns the metric key `sharpe` (NOT `sharpe_ratio`); benchmark keys are `beta`, `alpha`, `tracking_error`, `information_ratio`.
- Existing synthetic panel fixture: `tests/fixtures/panels.py::single_asset_panel(closes: list[float])`.

---

## File Structure

**Created:**
- `src/hedgefund/api/__init__.py` — package marker
- `src/hedgefund/api/config.py` — env-based settings (DATABASE_URL, etc.)
- `src/hedgefund/api/db/__init__.py`
- `src/hedgefund/api/db/engine.py` — SQLAlchemy engine, `SessionLocal`, `get_session` dependency
- `src/hedgefund/api/db/models.py` — `Base` + `BacktestRow` ORM model
- `src/hedgefund/api/db/repository.py` — `BacktestRepository` (only module touching SQL)
- `src/hedgefund/api/schemas.py` — Pydantic request/response models
- `src/hedgefund/api/serialization.py` — pandas → JSON-serializable helpers
- `src/hedgefund/api/deps.py` — `get_panel_loader` dependency
- `src/hedgefund/api/routes/__init__.py`
- `src/hedgefund/api/routes/backtests.py` — the four endpoints
- `src/hedgefund/api/app.py` — `create_app()` factory
- `migrations/env.py`, `migrations/script.py.mako`, `migrations/versions/0001_create_backtests.py`
- `alembic.ini` (repo root)
- `docker-compose.yml` (repo root)
- `.env.example` (repo root)
- `tests/api/__init__.py`
- `tests/api/conftest.py` — DB engine fixture, transaction-rollback session, TestClient
- `tests/api/test_serialization.py`
- `tests/api/test_schemas.py`
- `tests/api/test_repository.py`
- `tests/api/test_routes.py`
- `tests/api/test_smoke.py`

**Modified:**
- `pyproject.toml` — add `api` optional-dependency group
- `.gitignore` — add `.env`

---

## Task 1: Add dependencies and project wiring

**Files:**
- Modify: `pyproject.toml`
- Modify: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Add an `api` optional-dependency group to `pyproject.toml`**

In `[project.optional-dependencies]`, add a new group below the existing `dev` line:

```toml
[project.optional-dependencies]
dev = ["pytest>=8", "pytest-cov>=5", "hypothesis>=6"]
api = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.29",
    "sqlalchemy>=2.0",
    "alembic>=1.13",
    "psycopg[binary]>=3.1",
    "python-dotenv>=1.0",
    "httpx>=0.27",
]
```

- [ ] **Step 2: Install the new dependencies**

Run: `.venv/Scripts/python.exe -m pip install -e ".[dev,api]"`
Expected: installs fastapi, sqlalchemy, alembic, psycopg, etc. without error.

- [ ] **Step 3: Add `.env` to `.gitignore`**

Append a line `.env` to `.gitignore` (create the file if it does not exist; do not remove existing entries).

- [ ] **Step 4: Create `.env.example`**

```
# Copy to .env for local development. .env is gitignored.
DATABASE_URL=postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund
TEST_DATABASE_URL=postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test
```

- [ ] **Step 5: Verify install**

Run: `.venv/Scripts/python.exe -c "import fastapi, sqlalchemy, alembic, psycopg; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml .gitignore .env.example
git commit -m "chore(api): add FastAPI/SQLAlchemy/Alembic dependency group"
```

---

## Task 2: docker-compose Postgres + config module

**Files:**
- Create: `docker-compose.yml`
- Create: `src/hedgefund/api/__init__.py`
- Create: `src/hedgefund/api/config.py`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: hedgefund
      POSTGRES_PASSWORD: hedgefund
      POSTGRES_DB: hedgefund
    ports:
      - "5432:5432"
    volumes:
      - hedgefund_pgdata:/var/lib/postgresql/data

volumes:
  hedgefund_pgdata:
```

- [ ] **Step 2: Start Postgres and create the test database**

Run: `docker-compose up -d db`
Then create the test DB (the compose file only creates `hedgefund`):
Run: `docker-compose exec db psql -U hedgefund -d hedgefund -c "CREATE DATABASE hedgefund_test;"`
Expected: `CREATE DATABASE` (or a "already exists" error on re-run — safe to ignore).

- [ ] **Step 3: Create the api package marker**

`src/hedgefund/api/__init__.py` — empty file.

- [ ] **Step 4: Create `src/hedgefund/api/config.py`**

```python
from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

_DEFAULT_DB_URL = "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund"


class Settings:
    """Process configuration read from environment variables."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url


@lru_cache
def get_settings() -> Settings:
    return Settings(database_url=os.environ.get("DATABASE_URL", _DEFAULT_DB_URL))
```

- [ ] **Step 5: Verify config import**

Run: `.venv/Scripts/python.exe -c "from hedgefund.api.config import get_settings; print(get_settings().database_url)"`
Expected: prints a `postgresql+psycopg://...` URL.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml src/hedgefund/api/__init__.py src/hedgefund/api/config.py
git commit -m "feat(api): add docker-compose Postgres and config module"
```

---

## Task 3: ORM model and engine

**Files:**
- Create: `src/hedgefund/api/db/__init__.py`
- Create: `src/hedgefund/api/db/models.py`
- Create: `src/hedgefund/api/db/engine.py`

- [ ] **Step 1: Create the db package marker**

`src/hedgefund/api/db/__init__.py` — empty file.

- [ ] **Step 2: Create `src/hedgefund/api/db/models.py`**

```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class BacktestRow(Base):
    __tablename__ = "backtests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    spec: Mapped[dict] = mapped_column(JSONB, nullable=False)
    equity_curve: Mapped[list] = mapped_column(JSONB, nullable=False)
    benchmark_curve: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    trade_log: Mapped[list] = mapped_column(JSONB, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONB, nullable=False)
    starting_cash: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
```

- [ ] **Step 3: Create `src/hedgefund/api/db/engine.py`**

```python
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from hedgefund.api.config import get_settings

_engine = create_engine(get_settings().database_url, future=True)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a session and closing it afterward."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
```

- [ ] **Step 4: Verify model imports and table metadata**

Run: `.venv/Scripts/python.exe -c "from hedgefund.api.db.models import Base, BacktestRow; print(sorted(Base.metadata.tables['backtests'].columns.keys()))"`
Expected: prints the sorted column list including `benchmark_curve`, `created_at`, `duration_ms`, `equity_curve`, `id`, `metrics`, `name`, `spec`, `starting_cash`, `trade_log`.

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/db/__init__.py src/hedgefund/api/db/models.py src/hedgefund/api/db/engine.py
git commit -m "feat(api): add SQLAlchemy Base, BacktestRow model, and engine"
```

---

## Task 4: Alembic migration for the backtests table

**Files:**
- Create: `alembic.ini`
- Create: `migrations/env.py`
- Create: `migrations/script.py.mako`
- Create: `migrations/versions/0001_create_backtests.py`

- [ ] **Step 1: Create `alembic.ini` (repo root)**

```ini
[alembic]
script_location = migrations
sqlalchemy.url =

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

Note: `sqlalchemy.url` is intentionally blank — `env.py` reads it from `Settings` so the URL lives in one place.

- [ ] **Step 2: Create `migrations/script.py.mako`**

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 3: Create `migrations/env.py`**

```python
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from hedgefund.api.config import get_settings
from hedgefund.api.db.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    return get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(_url(), future=True)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 4: Create `migrations/versions/0001_create_backtests.py`**

```python
"""create backtests table

Revision ID: 0001
Revises:
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "backtests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("spec", postgresql.JSONB(), nullable=False),
        sa.Column("equity_curve", postgresql.JSONB(), nullable=False),
        sa.Column("benchmark_curve", postgresql.JSONB(), nullable=True),
        sa.Column("trade_log", postgresql.JSONB(), nullable=False),
        sa.Column("metrics", postgresql.JSONB(), nullable=False),
        sa.Column("starting_cash", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("backtests")
```

- [ ] **Step 5: Run the migration against the dev database**

Run: `.venv/Scripts/python.exe -m alembic upgrade head`
Expected: log line `Running upgrade  -> 0001, create backtests table`.

- [ ] **Step 6: Verify the table exists**

Run: `docker-compose exec db psql -U hedgefund -d hedgefund -c "\d backtests"`
Expected: psql prints the `backtests` table with all ten columns.

- [ ] **Step 7: Apply the migration to the test database too**

Run: `DATABASE_URL=postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test .venv/Scripts/python.exe -m alembic upgrade head`
Expected: same upgrade log against `hedgefund_test`. (On Windows PowerShell, set the env var first: `$env:DATABASE_URL="...hedgefund_test"; .venv/Scripts/python.exe -m alembic upgrade head`.) Note: the test suite also builds tables via `Base.metadata.create_all` in conftest, so this step is belt-and-suspenders for manual psql inspection.

- [ ] **Step 8: Commit**

```bash
git add alembic.ini migrations/
git commit -m "feat(api): add Alembic migration creating the backtests table"
```

---

## Task 5: Serialization helpers (pandas → JSON)

**Files:**
- Create: `tests/api/__init__.py`
- Create: `src/hedgefund/api/serialization.py`
- Test: `tests/api/test_serialization.py`

- [ ] **Step 1: Create the test package marker**

`tests/api/__init__.py` — empty file.

- [ ] **Step 2: Write the failing test**

`tests/api/test_serialization.py`:

```python
import pandas as pd

from hedgefund.api.serialization import curve_to_json, trades_to_json


def test_curve_to_json_emits_iso_date_value_pairs():
    idx = pd.DatetimeIndex(["2020-01-01", "2020-01-02"])
    series = pd.Series([100.0, 110.0], index=idx, name="equity")
    out = curve_to_json(series)
    assert out == [["2020-01-01", 100.0], ["2020-01-02", 110.0]]


def test_curve_to_json_handles_none():
    assert curve_to_json(None) is None


def test_trades_to_json_converts_dates_and_records():
    df = pd.DataFrame(
        {
            "date": pd.DatetimeIndex(["2020-01-02"]),
            "symbol": ["AAA"],
            "units": [1.5],
            "price": [100.0],
        }
    )
    out = trades_to_json(df)
    assert out == [{"date": "2020-01-02", "symbol": "AAA", "units": 1.5, "price": 100.0}]


def test_trades_to_json_handles_empty_frame():
    assert trades_to_json(pd.DataFrame()) == []
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_serialization.py -v`
Expected: FAIL — `ModuleNotFoundError: hedgefund.api.serialization`.

- [ ] **Step 4: Write the implementation**

`src/hedgefund/api/serialization.py`:

```python
from __future__ import annotations

import pandas as pd


def curve_to_json(series: pd.Series | None) -> list[list] | None:
    """Convert an equity/benchmark curve to [[iso_date, float_value], ...]."""
    if series is None:
        return None
    return [[ts.strftime("%Y-%m-%d"), float(val)] for ts, val in series.items()]


def trades_to_json(trade_log: pd.DataFrame) -> list[dict]:
    """Convert the trade-log DataFrame to a list of JSON-safe dicts."""
    if trade_log is None or trade_log.empty:
        return []
    df = trade_log.copy()
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    return df.to_dict(orient="records")
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_serialization.py -v`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/hedgefund/api/serialization.py tests/api/__init__.py tests/api/test_serialization.py
git commit -m "feat(api): add pandas-to-JSON serialization helpers"
```

---

## Task 6: Pydantic API schemas

**Files:**
- Create: `src/hedgefund/api/schemas.py`
- Test: `tests/api/test_schemas.py`

- [ ] **Step 1: Write the failing test**

`tests/api/test_schemas.py`:

```python
import uuid
from datetime import datetime, timezone

from hedgefund.api.schemas import (
    BacktestResultResponse,
    BacktestSummary,
    CreateBacktestRequest,
)
from hedgefund.dsl.spec import StrategySpec


def _minimal_spec_dict():
    return {
        "name": "t",
        "universe": ["AAA"],
        "indicators": [{"type": "momentum", "id": "m1", "lookback": 1}],
        "selection": {"mode": "cross_sectional", "rank_by": "m1", "long_top": 1, "short_bottom": 0},
        "start": "2020-01-01",
        "end": "2020-01-05",
    }


def test_create_request_defaults_starting_cash():
    req = CreateBacktestRequest(spec=StrategySpec(**_minimal_spec_dict()))
    assert req.starting_cash == 10_000.0


def test_summary_round_trips():
    s = BacktestSummary(
        id=uuid.uuid4(),
        name="t",
        created_at=datetime.now(timezone.utc),
        duration_ms=12,
        metrics={"sharpe": 1.0},
    )
    assert s.metrics["sharpe"] == 1.0


def test_result_response_allows_null_benchmark_curve():
    r = BacktestResultResponse(
        id=uuid.uuid4(),
        name="t",
        created_at=datetime.now(timezone.utc),
        duration_ms=12,
        starting_cash=10_000.0,
        spec=_minimal_spec_dict(),
        equity_curve=[["2020-01-01", 100.0]],
        benchmark_curve=None,
        trade_log=[],
        metrics={"sharpe": 1.0},
    )
    assert r.benchmark_curve is None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError: hedgefund.api.schemas`.

- [ ] **Step 3: Write the implementation**

`src/hedgefund/api/schemas.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from hedgefund.dsl.spec import StrategySpec


class CreateBacktestRequest(BaseModel):
    spec: StrategySpec
    starting_cash: float = Field(default=10_000.0, gt=0)


class BacktestSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime
    duration_ms: int
    metrics: dict[str, float]


class BacktestResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime
    duration_ms: int
    starting_cash: float
    spec: dict
    equity_curve: list[list]
    benchmark_curve: list[list] | None
    trade_log: list[dict]
    metrics: dict[str, float]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_schemas.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/schemas.py tests/api/test_schemas.py
git commit -m "feat(api): add request/response Pydantic schemas"
```

---

## Task 7: Test DB fixtures (conftest)

**Files:**
- Create: `tests/api/conftest.py`

This task wires the shared DB fixtures used by Tasks 8 and 10. It has no test of its own; it is verified when Task 8's repository tests run green.

- [ ] **Step 1: Create `tests/api/conftest.py`**

```python
from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from hedgefund.api.db.models import Base

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
```

- [ ] **Step 2: Verify fixtures import without collection errors**

Run: `.venv/Scripts/python.exe -m pytest tests/api/ --collect-only -q`
Expected: collection succeeds (lists serialization + schema tests; no errors from conftest).

- [ ] **Step 3: Commit**

```bash
git add tests/api/conftest.py
git commit -m "test(api): add Postgres test-DB engine and rollback session fixtures"
```

---

## Task 8: BacktestRepository

**Files:**
- Create: `src/hedgefund/api/db/repository.py`
- Test: `tests/api/test_repository.py`

- [ ] **Step 1: Write the failing test**

`tests/api/test_repository.py`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_repository.py -v`
Expected: FAIL — `ModuleNotFoundError: hedgefund.api.db.repository`.

- [ ] **Step 3: Write the implementation**

`src/hedgefund/api/db/repository.py`:

```python
from __future__ import annotations

import uuid

from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.orm import Session

from hedgefund.api.db.models import BacktestRow


class BacktestRepository:
    """The only module that touches SQL. Accepts a session, returns ORM rows."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        *,
        name: str,
        spec: dict,
        equity_curve: list,
        benchmark_curve: list | None,
        trade_log: list,
        metrics: dict,
        starting_cash: float,
        duration_ms: int,
    ) -> BacktestRow:
        row = BacktestRow(
            name=name,
            spec=spec,
            equity_curve=equity_curve,
            benchmark_curve=benchmark_curve,
            trade_log=trade_log,
            metrics=metrics,
            starting_cash=starting_cash,
            duration_ms=duration_ms,
        )
        self._session.add(row)
        self._session.flush()
        self._session.refresh(row)
        return row

    def get(self, backtest_id: uuid.UUID) -> BacktestRow | None:
        return self._session.get(BacktestRow, backtest_id)

    def list(self) -> list[BacktestRow]:
        stmt = select(BacktestRow).order_by(BacktestRow.created_at.desc())
        return list(self._session.scalars(stmt).all())

    def delete(self, backtest_id: uuid.UUID) -> bool:
        result = self._session.execute(
            sa_delete(BacktestRow).where(BacktestRow.id == backtest_id)
        )
        return result.rowcount > 0
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_repository.py -v`
Expected: 6 passed. (Requires `docker-compose up -d db` and the `hedgefund_test` database from Task 2.)

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/db/repository.py tests/api/test_repository.py
git commit -m "feat(api): add BacktestRepository with create/get/list/delete"
```

---

## Task 9: Panel-loader dependency + FastAPI app + routes

**Files:**
- Create: `src/hedgefund/api/deps.py`
- Create: `src/hedgefund/api/routes/__init__.py`
- Create: `src/hedgefund/api/routes/backtests.py`
- Create: `src/hedgefund/api/app.py`

- [ ] **Step 1: Create `src/hedgefund/api/deps.py`**

```python
from __future__ import annotations

from collections.abc import Callable
from datetime import date

from hedgefund.data.panel import PricePanel, load_panel

PanelLoader = Callable[[list[str], date, date], PricePanel]


def get_panel_loader() -> PanelLoader:
    """Default panel loader reading the parquet cache.

    Overridden in tests via app.dependency_overrides to return a synthetic panel.
    """

    def _load(symbols: list[str], start: date, end: date) -> PricePanel:
        return load_panel(symbols, start, end)

    return _load
```

- [ ] **Step 2: Create the routes package marker**

`src/hedgefund/api/routes/__init__.py` — empty file.

- [ ] **Step 3: Create `src/hedgefund/api/routes/backtests.py`**

```python
from __future__ import annotations

import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from hedgefund.api.db.engine import get_session
from hedgefund.api.db.repository import BacktestRepository
from hedgefund.api.deps import PanelLoader, get_panel_loader
from hedgefund.api.schemas import (
    BacktestResultResponse,
    BacktestSummary,
    CreateBacktestRequest,
)
from hedgefund.api.serialization import curve_to_json, trades_to_json
from hedgefund.dsl.validate import SpecValidationError, validate_spec
from hedgefund.engine.backtest import run_backtest
from hedgefund.risk.metrics import summarize

router = APIRouter(prefix="/backtests", tags=["backtests"])


@router.post("", response_model=BacktestResultResponse, status_code=status.HTTP_201_CREATED)
def create_backtest(
    body: CreateBacktestRequest,
    session: Session = Depends(get_session),
    panel_loader: PanelLoader = Depends(get_panel_loader),
) -> BacktestResultResponse:
    spec = body.spec
    try:
        validate_spec(spec)
    except SpecValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not isinstance(spec.universe, list):
        raise HTTPException(status_code=400, detail="universe='all' not supported yet")

    symbols = list(dict.fromkeys([*spec.universe, spec.benchmark]))
    try:
        panel = panel_loader(symbols, spec.start, spec.end)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=400, detail=f"missing market data for one of {symbols}"
        ) from exc

    started = time.perf_counter()
    result = run_backtest(spec, panel, starting_cash=body.starting_cash)
    duration_ms = int((time.perf_counter() - started) * 1000)

    if result.benchmark_curve is not None:
        metrics = summarize(result.equity_curve, benchmark=result.benchmark_curve)
    else:
        metrics = summarize(result.equity_curve)

    repo = BacktestRepository(session)
    row = repo.create(
        name=spec.name,
        spec=spec.model_dump(mode="json"),
        equity_curve=curve_to_json(result.equity_curve),
        benchmark_curve=curve_to_json(result.benchmark_curve),
        trade_log=trades_to_json(result.trade_log),
        metrics=metrics,
        starting_cash=body.starting_cash,
        duration_ms=duration_ms,
    )
    session.commit()
    session.refresh(row)
    return BacktestResultResponse.model_validate(row)


@router.get("", response_model=list[BacktestSummary])
def list_backtests(session: Session = Depends(get_session)) -> list[BacktestSummary]:
    repo = BacktestRepository(session)
    return [BacktestSummary.model_validate(r) for r in repo.list()]


@router.get("/{backtest_id}", response_model=BacktestResultResponse)
def get_backtest(
    backtest_id: uuid.UUID, session: Session = Depends(get_session)
) -> BacktestResultResponse:
    repo = BacktestRepository(session)
    row = repo.get(backtest_id)
    if row is None:
        raise HTTPException(status_code=404, detail="backtest not found")
    return BacktestResultResponse.model_validate(row)


@router.delete("/{backtest_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_backtest(
    backtest_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    repo = BacktestRepository(session)
    if not repo.delete(backtest_id):
        raise HTTPException(status_code=404, detail="backtest not found")
    session.commit()
```

- [ ] **Step 4: Create `src/hedgefund/api/app.py`**

```python
from __future__ import annotations

from fastapi import FastAPI

from hedgefund.api.routes.backtests import router as backtests_router


def create_app() -> FastAPI:
    app = FastAPI(title="HedgeFund Simulator API", version="0.1.0")
    app.include_router(backtests_router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 5: Verify the app imports and exposes routes**

Run: `.venv/Scripts/python.exe -c "from hedgefund.api.app import create_app; app=create_app(); print(sorted({r.path for r in app.routes}))"`
Expected: includes `/health`, `/backtests`, `/backtests/{backtest_id}`.

- [ ] **Step 6: Commit**

```bash
git add src/hedgefund/api/deps.py src/hedgefund/api/routes/ src/hedgefund/api/app.py
git commit -m "feat(api): add panel-loader dependency, routes, and app factory"
```

---

## Task 10: Route integration tests + smoke test

**Files:**
- Modify: `tests/api/conftest.py` (add `client` fixture with dependency overrides)
- Create: `tests/api/test_routes.py`
- Create: `tests/api/test_smoke.py`

- [ ] **Step 1: Confirm the synthetic panel's date range**

Open `tests/fixtures/panels.py` and read `single_asset_panel`. Confirm it builds a daily DatetimeIndex starting `2020-01-01` with one row per close, and the symbol column is named `"AAA"`. The specs below use `start=2020-01-01`, `end=2020-01-06`, `universe=["AAA"]`, `benchmark="AAA"` and pass 6 closes. If the fixture's start date or symbol differs, adjust the spec `start`/`end`/`universe`/`benchmark` in Steps 2 and 4 to match.

- [ ] **Step 2: Add a `client` fixture to `tests/api/conftest.py`**

Append the following to `tests/api/conftest.py` (keep the existing `engine` and `session` fixtures):

```python
from fastapi.testclient import TestClient

from hedgefund.api.app import create_app
from hedgefund.api.db.engine import get_session
from hedgefund.api.deps import get_panel_loader
from tests.fixtures.panels import single_asset_panel


@pytest.fixture
def client(session):
    app = create_app()

    def _override_session():
        yield session

    def _override_loader():
        def _load(symbols, start, end):
            # 6 ascending daily closes from 2020-01-01
            return single_asset_panel([100.0, 110.0, 121.0, 133.1, 146.41, 161.05])

        return _load

    app.dependency_overrides[get_session] = _override_session
    app.dependency_overrides[get_panel_loader] = _override_loader
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

Note: the overridden `get_session` yields the test's rollback-bound `session`, so route `session.commit()` calls flush within the test transaction and are rolled back at teardown — keeping tests isolated.

- [ ] **Step 3: Write the route tests**

`tests/api/test_routes.py`:

```python
import uuid


def _spec_body():
    return {
        "spec": {
            "name": "route_test",
            "universe": ["AAA"],
            "indicators": [{"type": "momentum", "id": "m1", "lookback": 1}],
            "selection": {
                "mode": "cross_sectional",
                "rank_by": "m1",
                "long_top": 1,
                "short_bottom": 0,
            },
            "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
            "rebalance": "daily",
            "costs": {"fee_bps": 10, "slippage_bps": 5},
            "start": "2020-01-01",
            "end": "2020-01-06",
            "benchmark": "AAA",
        },
        "starting_cash": 10000.0,
    }


def test_post_creates_and_returns_full_result(client):
    resp = client.post("/backtests", json=_spec_body())
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "route_test"
    assert "sharpe" in body["metrics"]
    assert len(body["equity_curve"]) > 0
    assert "id" in body


def test_post_then_get_by_id(client):
    created = client.post("/backtests", json=_spec_body()).json()
    resp = client.get(f"/backtests/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_list_returns_summary_without_curves(client):
    client.post("/backtests", json=_spec_body())
    resp = client.get("/backtests")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) >= 1
    assert "equity_curve" not in rows[0]
    assert "metrics" in rows[0]


def test_get_missing_returns_404(client):
    resp = client.get(f"/backtests/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_delete_removes_backtest(client):
    created = client.post("/backtests", json=_spec_body()).json()
    assert client.delete(f"/backtests/{created['id']}").status_code == 204
    assert client.get(f"/backtests/{created['id']}").status_code == 404


def test_invalid_spec_returns_422(client):
    body = _spec_body()
    # rank_by references an undefined indicator -> SpecValidationError -> 422
    body["spec"]["selection"]["rank_by"] = "does_not_exist"
    resp = client.post("/backtests", json=body)
    assert resp.status_code == 422
```

- [ ] **Step 4: Write the smoke test**

`tests/api/test_smoke.py`:

```python
def test_smoke_post_minimal_spec_persists_and_returns_metrics(client):
    body = {
        "spec": {
            "name": "smoke",
            "universe": ["AAA"],
            "indicators": [{"type": "momentum", "id": "m1", "lookback": 1}],
            "selection": {
                "mode": "cross_sectional",
                "rank_by": "m1",
                "long_top": 1,
                "short_bottom": 0,
            },
            "start": "2020-01-01",
            "end": "2020-01-06",
            "benchmark": "AAA",
        }
    }
    resp = client.post("/backtests", json=body)
    assert resp.status_code == 201
    result = resp.json()
    assert "sharpe" in result["metrics"]
    assert "total_return" in result["metrics"]
    # benchmark == universe symbol, so relative metrics are present
    assert "information_ratio" in result["metrics"]
    # persisted and retrievable
    assert client.get(f"/backtests/{result['id']}").status_code == 200
```

- [ ] **Step 5: Run the full API suite**

Run: `.venv/Scripts/python.exe -m pytest tests/api/ -v`
Expected: all serialization, schema, repository, route, and smoke tests pass. If any route test fails on date alignment, adjust spec dates per Step 1.

- [ ] **Step 6: Commit**

```bash
git add tests/api/conftest.py tests/api/test_routes.py tests/api/test_smoke.py
git commit -m "test(api): add route integration tests and smoke test"
```

---

## Task 11: Coverage gate + full-suite verification

**Files:**
- (no new source; verification + any small fixes)

- [ ] **Step 1: Run the whole test suite**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: all tests pass (existing 53 + new API tests).

- [ ] **Step 2: Check API coverage meets the 80% gate**

Run: `.venv/Scripts/python.exe -m pytest tests/api/ --cov=src/hedgefund/api --cov-report=term-missing`
Expected: `hedgefund/api` total coverage ≥ 80%. If any module is below, add a focused test for the uncovered branch and re-run.

- [ ] **Step 3: Add the 400-path test if needed for coverage**

If the `FileNotFoundError` branch in `create_backtest` is uncovered, add to `tests/api/test_routes.py`:

```python
def test_missing_market_data_returns_400(session):
    from fastapi.testclient import TestClient

    from hedgefund.api.app import create_app
    from hedgefund.api.db.engine import get_session
    from hedgefund.api.deps import get_panel_loader

    app = create_app()

    def _override_session():
        yield session

    def _raising_loader():
        def _load(symbols, start, end):
            raise FileNotFoundError("no cache")

        return _load

    app.dependency_overrides[get_session] = _override_session
    app.dependency_overrides[get_panel_loader] = _raising_loader
    with TestClient(app) as c:
        resp = c.post("/backtests", json=_spec_body())
    app.dependency_overrides.clear()
    assert resp.status_code == 400
```

Re-run Step 2 and confirm ≥ 80%.

- [ ] **Step 4: Final commit**

```bash
git add tests/api/
git commit -m "test(api): cover missing-data 400 path; meet 80% coverage gate"
```

---

## Manual run reference (not a test step)

To exercise the API by hand against a populated parquet cache:

```bash
docker-compose up -d db
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn hedgefund.api.app:app --reload
# then POST specs/example_momentum.json to http://localhost:8000/backtests
```

---

## Self-Review Notes

- **Spec coverage:** §3 architecture → Tasks 3, 8, 9; §4 API surface (4 endpoints + status codes) → Task 9 + Task 10 tests; §5 data model (all 10 columns) → Tasks 3 & 4; §6 config/docker → Tasks 1 & 2; §7 testing (unit/integration/smoke, real Postgres, rollback isolation, injected loader) → Tasks 7, 8, 10; §8 dependencies → Task 1; §9 risks (real-DB tests via docker-compose, JSONB round-trip via serialization Task 5, schema drift via migration Task 4 + create_all parity in conftest).
- **Metric key:** uses `sharpe` (verified against `risk/metrics.py::summarize`), not `sharpe_ratio`.
- **Type consistency:** `BacktestRepository.create(**kwargs)` keyword signature matches the call site in `create_backtest`; `curve_to_json`/`trades_to_json` names match between Task 5 and Task 9; `get_panel_loader`/`PanelLoader` names match between Task 9 and Task 10; `CreateBacktestRequest`/`BacktestSummary`/`BacktestResultResponse` names match between Task 6 and Task 9.
- **DB URL scheme:** `postgresql+psycopg://` (psycopg 3) used consistently in config, conftest, and `.env.example`.
- **Placeholder scan:** no TBD/TODO; every code step contains complete code; the one conditional step (Task 11 Step 3) is gated on a measured coverage result and includes full code.
