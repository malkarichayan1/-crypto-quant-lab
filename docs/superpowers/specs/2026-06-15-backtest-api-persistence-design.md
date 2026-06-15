# Slice 2: Backtest API + Persistence — Design Spec

**Date:** 2026-06-15
**Project:** AI Crypto Hedge Fund Simulator
**Slice:** 2 of 4 (surface A — REST API + persistence; surface B, the React dashboard, follows)

---

## 1. Purpose

Expose the deterministic backtest engine over a REST API and persist every run so
results can be queried, compared, and visualized later. This is the prerequisite
for the React dashboard (surface B): the dashboard submits specs to this API and
reads stored results from it.

The engine, DSL, risk, and CLI modules are already built and trusted. This slice
adds **only** an API and a storage layer on top of them. It introduces no new
financial logic — `run_backtest()` and `summarize()` are called exactly as the
CLI calls them today.

### Success criteria

- `POST /backtests` with a valid `StrategySpec` runs the engine, stores the
  result, and returns the full result (metrics + curves + trade log) in one
  synchronous response.
- `GET /backtests` lists stored runs (summary only, no curves); `GET /backtests/{id}`
  returns one full run; `DELETE /backtests/{id}` removes one.
- Results survive a process restart (real persistence, not in-memory).
- The stack runs against Postgres locally via `docker-compose up` and is
  deployable to a managed Postgres later with no code change.
- `hedgefund/api/` at 80%+ test coverage, tested against a real Postgres test DB.

## 2. Scope

### In scope

- FastAPI application exposing four endpoints (`POST`, `GET` list, `GET` by id,
  `DELETE`).
- Synchronous backtest execution inside `POST /backtests` (engine runs are
  sub-second; no async job queue).
- SQLAlchemy 2.0 (sync) ORM + Alembic migrations + Postgres.
- Repository pattern isolating all SQL from the routes.
- `docker-compose.yml` providing local Postgres; `.env`-based configuration.
- Test suite (unit + integration + smoke) against a real Postgres test database.

### Explicitly out of scope

- React dashboard — surface B, next spec.
- Async/background job execution, polling, websockets — engine runs are fast
  enough to return inline.
- Authentication / authorization / multi-user — single-user local research tool.
- Pagination on the list endpoint — run counts stay small locally (YAGNI).
- Re-running or editing a stored spec via the API — stored `spec` JSONB enables
  it later, but no endpoint for it now.
- LangGraph agents — surface C, later slice.

## 3. Architecture

New package alongside the existing `hedgefund/` modules. The existing CLI, engine,
DSL, and risk code is **untouched** — the API imports the same functions.

```
src/hedgefund/
  api/
    __init__.py
    app.py            # create_app() FastAPI factory
    schemas.py        # Pydantic request/response models (API boundary)
    routes/
      __init__.py
      backtests.py    # all /backtests routes
    db/
      __init__.py
      engine.py       # SQLAlchemy engine + get_session() FastAPI dependency
      models.py       # ORM table definitions
      repository.py   # BacktestRepository — the ONLY module that touches SQL
migrations/           # Alembic (repo root)
  env.py
  versions/
alembic.ini           # repo root
docker-compose.yml    # repo root — local Postgres
.env.example          # repo root — committed template
```

### Layering rules

- **Routes** call the repository and return Pydantic schemas. They never touch
  SQLAlchemy sessions directly except to receive one via dependency injection.
- **Repository** is the only place SQL/ORM lives. It accepts a session, returns
  ORM objects or plain dicts, and knows nothing about HTTP.
- **Schemas** define the API boundary and are distinct from both the DSL
  `StrategySpec` (reused as the POST request body) and the ORM models.

### Request flow for `POST /backtests`

1. Route receives a `StrategySpec` body (+ optional `starting_cash`).
2. Route validates the spec via the existing `validate_spec()`.
3. Route loads the price panel (`load_panel`) for `universe + benchmark`.
4. Route calls `run_backtest()` then `summarize()` — identical to the CLI path.
5. Route serializes curves/trade log/metrics and calls
   `repository.create(...)`, timing the wall-clock engine duration.
6. Route returns the full result as a `BacktestResultResponse`.

## 4. API surface

| Method | Path | Request body | Response |
|--------|------|--------------|----------|
| `POST` | `/backtests` | `StrategySpec` + optional `starting_cash` (default 10000) | `BacktestResultResponse` (201) |
| `GET` | `/backtests` | — | `list[BacktestSummary]` (200) |
| `GET` | `/backtests/{id}` | — | `BacktestResultResponse` (200) or 404 |
| `DELETE` | `/backtests/{id}` | — | 204, or 404 |

- `BacktestResultResponse` and the `GET /{id}` response are the same shape: full
  result including `equity_curve`, `benchmark_curve` (nullable), `trade_log`, and
  the flat `metrics` dict.
- `BacktestSummary` (list endpoint) carries only `id`, `name`, `created_at`,
  `duration_ms`, and `metrics` — **no curves**, so list payloads stay small.
- Validation errors (bad spec) return 422 via FastAPI's standard handling; a
  benchmark/universe symbol missing from the cache returns 400 with a clear
  message.

## 5. Data model

Single `backtests` table.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` PK | generated server-side (`uuid4`) |
| `name` | `TEXT NOT NULL` | from `spec.name` |
| `spec` | `JSONB NOT NULL` | full `StrategySpec` dict — enables future re-run |
| `equity_curve` | `JSONB NOT NULL` | `[[iso_date, value], ...]` |
| `benchmark_curve` | `JSONB` | same shape, nullable |
| `trade_log` | `JSONB NOT NULL` | list of trade dicts |
| `metrics` | `JSONB NOT NULL` | flat dict from `summarize()` |
| `starting_cash` | `DOUBLE PRECISION NOT NULL` | stored for reproducibility |
| `created_at` | `TIMESTAMPTZ NOT NULL` | server default `now()` |
| `duration_ms` | `INTEGER NOT NULL` | wall-clock engine run time |

All variable-length structures use `JSONB` — avoids schema churn as the metrics
dict grows and lets Postgres index into it later if needed. One table, one
initial migration, no joins.

## 6. Configuration + Docker

- Config via environment variables, loaded at startup with `python-dotenv`:
  - `DATABASE_URL` (e.g. `postgresql://hedgefund:hedgefund@localhost:5432/hedgefund`)
  - `TEST_DATABASE_URL` (separate `hedgefund_test` database)
- `.env` is gitignored; `.env.example` is committed as a template.
- `docker-compose.yml` provides a single `postgres:16` service for local dev.
- Cloud-ready: switching to a managed Postgres is a `DATABASE_URL` change only.

## 7. Testing approach

Tested against a **real** Postgres test database (`hedgefund_test`) — no SQLite
shim, no mocks — so schema and migration behavior matches production.

- **Unit:** repository functions (create / list / get / delete). A session-scoped
  fixture creates tables once; each test runs in a transaction rolled back at
  teardown for isolation.
- **Integration:** FastAPI `TestClient` exercises route → repository → DB. Covers
  `POST` happy path (submit minimal spec, assert 201, assert metrics keys present,
  assert a DB row exists), `GET` list/by-id, `DELETE`, and 404/400/422 paths.
- **Smoke:** one test that `POST`s the existing `examples/momentum.json` spec and
  asserts a valid result with `sharpe_ratio` and `information_ratio` present —
  catches any wiring break between the API and the existing engine.

Coverage target: **80%** on `hedgefund/api/`, matching the engine and risk gates.

## 8. Dependencies added

- `fastapi`, `uvicorn[standard]` — API + ASGI server
- `sqlalchemy>=2.0` — ORM
- `alembic` — migrations
- `psycopg[binary]` — Postgres driver
- `python-dotenv` — `.env` loading
- `httpx` — required by FastAPI `TestClient` (dev/test)

## 9. Risks + mitigations

- **Real-DB tests need Postgres running.** Mitigation: `docker-compose up` is the
  documented prerequisite; CI would spin up a Postgres service container.
- **JSONB round-trip of pandas objects.** Curves/trade log must be converted to
  plain JSON-serializable structures before storage. Mitigation: explicit
  serialization helpers in the route layer, covered by the smoke test.
- **Schema drift between ORM and migrations.** Mitigation: Alembic autogenerate
  is reviewed by hand; the test DB is built from migrations, not `create_all`.
