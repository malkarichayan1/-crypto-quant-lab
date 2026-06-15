# Slice 2: React Dashboard — Design Spec

**Date:** 2026-06-15
**Project:** AI Crypto Hedge Fund Simulator
**Slice:** 2 of 4 (surface B — React dashboard; surface A, the REST API + persistence, is complete)

---

## 1. Purpose

Provide a browser-based UI for submitting crypto backtests and exploring stored results. The dashboard talks exclusively to the FastAPI backend (Surface A) — it introduces no new financial logic, no new storage, and no new API endpoints.

### Success criteria

- A user can fill out a form, click Run, and see an equity curve with metrics in one browser session.
- Stored runs appear on the History page as clickable cards with key metrics.
- The full result (chart, all metrics, trade log) is available on the Result page.
- The UI runs locally with `npm run dev` pointing at `http://localhost:8000`.

---

## 2. Scope

### In scope

- Vite + React + TypeScript SPA, served locally.
- Three pages: New Run, History, Result.
- Form-based strategy spec builder (no raw JSON editing).
- Equity curve chart with benchmark overlay (Recharts).
- Metrics panel, collapsible trade log table.
- History card grid with key metrics and delete.
- CORS middleware added to the FastAPI app (prerequisite).

### Explicitly out of scope

- Authentication / multi-user.
- Deployment / hosting — local dev only for this slice.
- Comparison view (overlaying multiple runs on one chart).
- LangGraph agent UI — Surface C.
- Dark/light theme toggle — ships dark only.

---

## 3. Architecture

### Stack

| Concern | Library |
|---|---|
| Build | Vite + TypeScript |
| UI | React 18 |
| Routing | react-router-dom v6 |
| Server state | TanStack Query v5 |
| Charts | Recharts v2 |
| Forms | React controlled components (no form library) |

### File structure

```
dashboard/                  # repo root — sibling to src/
  index.html
  vite.config.ts
  tsconfig.json
  package.json
  .env.local                # VITE_API_URL=http://localhost:8000 (gitignored)
  src/
    main.tsx                # Vite entry, router + query client setup
    types.ts                # BacktestSummary, BacktestResult TS types
    api/
      client.ts             # BASE_URL from env, typed apiFetch helper
      backtests.ts          # createBacktest, listBacktests, getBacktest, deleteBacktest
    components/
      NavBar.tsx
      EquityChart.tsx       # LineChart with equity + optional benchmark series
      MetricsPanel.tsx      # right-side metrics list
      TradeLogTable.tsx     # collapsible table, collapsed by default
      RunCard.tsx           # history grid card (metrics only, no sparkline)
      spec-form/
        SpecForm.tsx        # wizard shell + step state
        Step1Strategy.tsx   # name, universe, benchmark, dates, cash
        Step2Indicators.tsx # dynamic indicator rows
        Step3Selection.tsx  # rank_by, long_top, short_bottom
        Step4Sizing.tsx     # scheme, leverage, rebalance, fees + Run button
    pages/
      NewRunPage.tsx
      HistoryPage.tsx
      ResultPage.tsx
```

### Data flow

```
NewRunPage  → POST /backtests  → navigate to /backtests/:id
HistoryPage → GET  /backtests  → card grid → click → /backtests/:id
ResultPage  → GET  /backtests/:id → chart + metrics + trade log
```

`VITE_API_URL` env var (default `http://localhost:8000`) controls the backend URL.

---

## 4. Pages

### 4.1 New Run (`/`)

A four-step wizard: progress sidebar on the left, active step content on the right. State lives in `SpecForm.tsx`; each step component receives it via props. Back/Next navigate between steps while preserving all entered values.

**Step 1 — Strategy**
- Name: text input (required)
- Universe: multi-select tag picker; fixed list of 20 symbols (BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT, ADA/USDT, XRP/USDT, DOGE/USDT, DOT/USDT, AVAX/USDT, MATIC/USDT, LINK/USDT, UNI/USDT, ATOM/USDT, LTC/USDT, ALGO/USDT, XLM/USDT, VET/USDT, FIL/USDT, THETA/USDT, TRX/USDT)
- Benchmark: single-select dropdown from the same 20 symbols (default BTC/USDT)
- Start date / End date: date inputs
- Starting cash: number input (default 10,000)

**Step 2 — Indicators**
- Dynamic list; each row: Type (momentum | mean_reversion), ID (text, auto-filled as `m1`, `m2` …, editable), Lookback (integer ≥ 1)
- Remove button per row; Add indicator button; minimum one required

**Step 3 — Selection**
- Mode: fixed `cross_sectional` (read-only label)
- Rank by: dropdown populated from indicator IDs entered in Step 2
- Long top N: integer input (≥ 1)
- Short bottom N: integer input (default 0)

**Step 4 — Sizing & Costs**
- Sizing scheme: select (equal_weight | inverse_vol | fixed_fraction)
- Gross leverage: number input (default 1.0)
- Rebalance: select (daily | weekly | monthly)
- Fee bps: integer input (default 10)
- Slippage bps: integer input (default 5)
- **Run Backtest** button — triggers the TanStack Query mutation

On submit: Run button shows spinner and is disabled. On success: navigate to `/backtests/:id`. On error: display the API error message inline above the button (422 for spec validation, 400 for missing data).

### 4.2 History (`/history`)

- Fetches `GET /backtests` via TanStack Query.
- Responsive card grid: 2 columns on medium, 3 on wide screens.
- Each `RunCard`: name, created date, Sharpe (color-coded by value), Total Return (green/red), Max Drawdown (red), duration.
- No sparkline — `BacktestSummary` does not include equity_curve data.
- Delete button: calls `DELETE /backtests/:id`, on success invalidates the `['backtests']` query.
- Empty state message: "No runs yet — go to New Run to get started."

### 4.3 Result (`/backtests/:id`)

- Fetches `GET /backtests/:id` via TanStack Query.
- Two-column layout: left (2/3) = `EquityChart`, right (1/3) = `MetricsPanel`.
- Below both columns: collapsible `TradeLogTable` (collapsed by default).

**EquityChart:** Recharts `LineChart`. Two `Line` series: equity_curve (solid, brand purple `#7c6fff`) and benchmark_curve (dashed, muted gray) if present. X-axis date labels, Y-axis portfolio value. Responsive container fills its column. Tooltip on hover.

**MetricsPanel:** Labeled rows in two groups:
- Core (always present): Total Return, CAGR, Ann. Vol, Sharpe, Sortino, Max DD, VaR 95, CVaR 95
- Benchmark-relative (shown only if keys are present in metrics dict): Beta, Alpha, Tracking Error, Info Ratio
- Return values color-coded green if positive, red if negative. Drawdown always red.

**TradeLogTable:** Toggle button to expand/collapse. When expanded: table with columns Date, Symbol, Units, Price — sorted by date ascending.

---

## 5. API integration

```typescript
// src/api/client.ts
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}
```

TanStack Query keys: `['backtests']` for list, `['backtests', id]` for single result. POST mutation invalidates `['backtests']`. DELETE mutation invalidates `['backtests']` and removes `['backtests', id]`.

---

## 6. TypeScript types

```typescript
// src/types.ts
export interface BacktestSummary {
  id: string
  name: string
  created_at: string
  duration_ms: number
  metrics: Record<string, number>
}

export interface BacktestResult extends BacktestSummary {
  starting_cash: number
  spec: Record<string, unknown>
  equity_curve: [string, number][]
  benchmark_curve: [string, number][] | null
  trade_log: Record<string, unknown>[]
}
```

---

## 7. CORS prerequisite

Before the dashboard can call the API, `CORSMiddleware` must be added to `create_app()` in `src/hedgefund/api/app.py`:

```python
from fastapi.middleware.cors import CORSMiddleware

def create_app() -> FastAPI:
    app = FastAPI(...)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(backtests_router)
    ...
```

This is Task 1 of the implementation plan.

---

## 8. Dependencies

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6",
    "@tanstack/react-query": "^5",
    "recharts": "^2"
  },
  "devDependencies": {
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5",
    "@types/react": "^18",
    "@types/react-dom": "^18"
  }
}
```

---

## 9. Risks + mitigations

- **CORS:** FastAPI must allow `http://localhost:5173`. Mitigation: Task 1 of the plan adds `CORSMiddleware`.
- **BacktestSummary has no equity_curve:** History cards show metrics only. Acceptable — the full chart is one click away.
- **POST blocks for several seconds:** Show spinner on Run button and disable while pending.
- **Type drift between Python and TypeScript:** TS types in `src/types.ts` mirror the Pydantic schemas. No codegen in this slice — update manually if Python schemas change.
