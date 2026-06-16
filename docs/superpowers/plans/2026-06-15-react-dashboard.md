# React Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vite + React + TypeScript dashboard that submits backtests to the existing FastAPI backend and visualizes stored results.

**Architecture:** A standalone `dashboard/` SPA (sibling to `src/`) layered as pages → components → API client. TanStack Query owns all server state; the four-step spec form owns local state and transforms it to a `CreateBacktestRequest` via one tested pure function. Recharts renders the equity curve. A CORS middleware task on the Python side is the prerequisite.

**Tech Stack:** Vite 5, React 18, TypeScript 5, react-router-dom 6, TanStack Query 5, Recharts 2, Vitest + React Testing Library + jsdom for tests.

**Spec:** `docs/superpowers/specs/2026-06-15-react-dashboard-design.md`

**Conventions for every task below:**
- Python commands run via `.venv/Scripts/python.exe -m ...` (system Python lacks deps).
- Node commands run from the `dashboard/` directory unless noted: `cd dashboard && npm ...`.
- Package manager is **npm** (no pnpm/yarn lockfile in this repo).
- The real `StrategySpec` lives in `src/hedgefund/dsl/spec.py`. Indicator types are `momentum | sma | rsi | volatility | zscore`; `momentum`/`volatility`/`zscore` use `lookback`, `sma`/`rsi` use `period`, `zscore` additionally needs `source_id`. Rebalance is `daily | weekly` only. Sizing scheme is `equal_weight | inverse_vol | fixed_fraction`.
- The API base URL in tests/dev defaults to `http://localhost:8000`; Vite dev server runs on `http://localhost:5173`.
- All commits go to `main`.

---

## File Structure

**Created (Python side):**
- `tests/api/test_cors.py` — CORS header test

**Modified (Python side):**
- `src/hedgefund/api/app.py` — add `CORSMiddleware`

**Created (dashboard):**
- `dashboard/package.json`, `dashboard/vite.config.ts`, `dashboard/tsconfig.json`, `dashboard/tsconfig.node.json`
- `dashboard/index.html`
- `dashboard/.env.local`, `dashboard/.gitignore`
- `dashboard/src/main.tsx` — entry: router + QueryClientProvider
- `dashboard/src/vitest.setup.ts` — jest-dom matchers
- `dashboard/src/constants.ts` — symbol universe list
- `dashboard/src/types.ts` — `BacktestSummary`, `BacktestResult`, `CreateBacktestRequest`
- `dashboard/src/api/client.ts` — `apiFetch`
- `dashboard/src/api/backtests.ts` — four endpoint functions
- `dashboard/src/lib/format.ts` — metric formatting helpers
- `dashboard/src/lib/buildRequest.ts` — form state → `CreateBacktestRequest`
- `dashboard/src/components/NavBar.tsx`
- `dashboard/src/components/EquityChart.tsx`
- `dashboard/src/components/MetricsPanel.tsx`
- `dashboard/src/components/TradeLogTable.tsx`
- `dashboard/src/components/RunCard.tsx`
- `dashboard/src/components/spec-form/SpecForm.tsx`
- `dashboard/src/components/spec-form/types.ts` — `SpecFormState`, `IndicatorRow`, `INITIAL_FORM_STATE`
- `dashboard/src/components/spec-form/Step1Strategy.tsx`
- `dashboard/src/components/spec-form/Step2Indicators.tsx`
- `dashboard/src/components/spec-form/Step3Selection.tsx`
- `dashboard/src/components/spec-form/Step4Sizing.tsx`
- `dashboard/src/pages/NewRunPage.tsx`
- `dashboard/src/pages/HistoryPage.tsx`
- `dashboard/src/pages/ResultPage.tsx`
- `dashboard/src/styles/tokens.css`, `dashboard/src/styles/global.css`
- Test files co-located under `dashboard/src/**/*.test.ts(x)`

**Modified:**
- `.gitignore` (repo root) — add `dashboard/node_modules` and `dashboard/dist`

---

## Task 1: CORS middleware on the FastAPI app

**Files:**
- Modify: `src/hedgefund/api/app.py`
- Test: `tests/api/test_cors.py`

- [ ] **Step 1: Write the failing test**

`tests/api/test_cors.py`:

```python
from __future__ import annotations

from fastapi.testclient import TestClient

from hedgefund.api.app import create_app


def test_cors_allows_vite_dev_origin():
    client = TestClient(create_app())
    resp = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_cors.py -v`
Expected: FAIL — `access-control-allow-origin` header is absent (assertion gets `None`).

- [ ] **Step 3: Add the middleware**

In `src/hedgefund/api/app.py`, add the import and register the middleware inside `create_app()` **before** `app.include_router(...)`:

```python
from fastapi.middleware.cors import CORSMiddleware
```

```python
def create_app() -> FastAPI:
    app = FastAPI(title="HedgeFund Simulator API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(backtests_router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/api/test_cors.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/app.py tests/api/test_cors.py
git commit -m "feat(api): allow CORS from the Vite dev origin"
```

---

## Task 2: Scaffold the Vite + React + TS project

**Files:**
- Create: `dashboard/package.json`, `dashboard/vite.config.ts`, `dashboard/tsconfig.json`, `dashboard/tsconfig.node.json`, `dashboard/index.html`, `dashboard/.env.local`, `dashboard/.gitignore`, `dashboard/src/main.tsx`, `dashboard/src/vitest.setup.ts`, `dashboard/src/App.tsx`
- Modify: `.gitignore` (repo root)

- [ ] **Step 1: Create `dashboard/package.json`**

```json
{
  "name": "hedgefund-dashboard",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.51.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `dashboard/vite.config.ts`**

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/vitest.setup.ts',
  },
})
```

- [ ] **Step 3: Create `dashboard/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create `dashboard/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create `dashboard/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HedgeFund Simulator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `dashboard/.env.local`**

```
VITE_API_URL=http://localhost:8000
```

- [ ] **Step 7: Create `dashboard/.gitignore`**

```
node_modules
dist
*.local
```

- [ ] **Step 8: Append to the repo-root `.gitignore`**

Append these two lines to the existing root `.gitignore` (do not remove existing entries):

```
dashboard/node_modules
dashboard/dist
```

- [ ] **Step 9: Create `dashboard/src/vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 10: Create a minimal `dashboard/src/App.tsx`**

```tsx
export default function App() {
  return <h1>HedgeFund Simulator</h1>
}
```

- [ ] **Step 11: Create `dashboard/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 12: Install dependencies**

Run: `cd dashboard && npm install`
Expected: completes without error, creates `dashboard/package-lock.json` and `dashboard/node_modules`.

- [ ] **Step 13: Verify the build and the (empty) test runner**

Run: `cd dashboard && npm run build`
Expected: `tsc -b` passes and Vite emits `dist/` with no errors.

Run: `cd dashboard && npm test`
Expected: Vitest runs and reports "No test files found" (exit 0) — confirms the runner is wired.

- [ ] **Step 14: Commit**

```bash
git add dashboard/package.json dashboard/package-lock.json dashboard/vite.config.ts dashboard/tsconfig.json dashboard/tsconfig.node.json dashboard/index.html dashboard/.env.local dashboard/.gitignore dashboard/src/main.tsx dashboard/src/App.tsx dashboard/src/vitest.setup.ts .gitignore
git commit -m "chore(dashboard): scaffold Vite + React + TS project with Vitest"
```

---

## Task 3: TypeScript types, constants, and API client

**Files:**
- Create: `dashboard/src/types.ts`, `dashboard/src/constants.ts`, `dashboard/src/api/client.ts`, `dashboard/src/api/backtests.ts`
- Test: `dashboard/src/api/client.test.ts`

- [ ] **Step 1: Create `dashboard/src/types.ts`**

```typescript
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

export interface CreateBacktestRequest {
  spec: Record<string, unknown>
  starting_cash: number
}
```

- [ ] **Step 2: Create `dashboard/src/constants.ts`**

```typescript
export const SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'ADA/USDT',
  'XRP/USDT', 'DOGE/USDT', 'DOT/USDT', 'AVAX/USDT', 'MATIC/USDT',
  'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'ALGO/USDT',
  'XLM/USDT', 'VET/USDT', 'FIL/USDT', 'THETA/USDT', 'TRX/USDT',
] as const
```

- [ ] **Step 3: Write the failing test for the API client**

`dashboard/src/api/client.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('apiFetch', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ))
    const data = await apiFetch<{ ok: boolean }>('/health')
    expect(data.ok).toBe(true)
  })

  it('throws with the API detail message on error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'bad spec' }), { status: 422 }),
    ))
    await expect(apiFetch('/backtests')).rejects.toThrow('bad spec')
  })

  it('throws a generic message when the body has no detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('not json', { status: 500 }),
    ))
    await expect(apiFetch('/backtests')).rejects.toThrow('HTTP 500')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/api/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 5: Create `dashboard/src/api/client.ts`**

```typescript
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
```

- [ ] **Step 6: Create `dashboard/src/api/backtests.ts`**

```typescript
import { apiFetch } from './client'
import type {
  BacktestResult,
  BacktestSummary,
  CreateBacktestRequest,
} from '../types'

export function listBacktests(): Promise<BacktestSummary[]> {
  return apiFetch<BacktestSummary[]>('/backtests')
}

export function getBacktest(id: string): Promise<BacktestResult> {
  return apiFetch<BacktestResult>(`/backtests/${id}`)
}

export function createBacktest(
  body: CreateBacktestRequest,
): Promise<BacktestResult> {
  return apiFetch<BacktestResult>('/backtests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function deleteBacktest(id: string): Promise<void> {
  await apiFetch<void>(`/backtests/${id}`, { method: 'DELETE' })
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/api/client.test.ts`
Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add dashboard/src/types.ts dashboard/src/constants.ts dashboard/src/api/
git commit -m "feat(dashboard): add types, symbol constants, and API client"
```

---

## Task 4: Metric formatting helpers

**Files:**
- Create: `dashboard/src/lib/format.ts`
- Test: `dashboard/src/lib/format.test.ts`

- [ ] **Step 1: Write the failing test**

`dashboard/src/lib/format.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { formatPct, formatNum, signClass, METRIC_LABELS } from './format'

describe('formatPct', () => {
  it('renders a fraction as a signed percentage', () => {
    expect(formatPct(0.6421)).toBe('+64.21%')
    expect(formatPct(-0.18)).toBe('-18.00%')
  })
})

describe('formatNum', () => {
  it('rounds to two decimals', () => {
    expect(formatNum(1.4239)).toBe('1.42')
  })
})

describe('signClass', () => {
  it('classifies positive and negative values', () => {
    expect(signClass(0.1)).toBe('pos')
    expect(signClass(-0.1)).toBe('neg')
    expect(signClass(0)).toBe('pos')
  })
})

describe('METRIC_LABELS', () => {
  it('maps the sharpe key to a human label', () => {
    expect(METRIC_LABELS.sharpe).toBe('Sharpe')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/lib/format.test.ts`
Expected: FAIL — cannot resolve `./format`.

- [ ] **Step 3: Create `dashboard/src/lib/format.ts`**

```typescript
export function formatPct(fraction: number): string {
  const pct = fraction * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

export function formatNum(value: number): string {
  return value.toFixed(2)
}

export function signClass(value: number): 'pos' | 'neg' {
  return value >= 0 ? 'pos' : 'neg'
}

export const METRIC_LABELS: Record<string, string> = {
  total_return: 'Total Return',
  cagr: 'CAGR',
  ann_vol: 'Ann. Vol',
  sharpe: 'Sharpe',
  sortino: 'Sortino',
  max_drawdown: 'Max Drawdown',
  var_95: 'VaR 95',
  cvar_95: 'CVaR 95',
  beta: 'Beta',
  alpha: 'Alpha',
  tracking_error: 'Tracking Error',
  information_ratio: 'Info Ratio',
}

// Keys that should render as percentages rather than raw numbers.
export const PERCENT_METRICS = new Set([
  'total_return',
  'cagr',
  'ann_vol',
  'max_drawdown',
  'var_95',
  'cvar_95',
  'alpha',
  'tracking_error',
])
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/lib/format.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/format.ts dashboard/src/lib/format.test.ts
git commit -m "feat(dashboard): add metric formatting helpers"
```

---

## Task 5: Spec-form state types + the buildRequest transform

This is the highest-value unit in the app: it converts form state into the exact JSON the API expects. Test it thoroughly.

**Files:**
- Create: `dashboard/src/components/spec-form/types.ts`, `dashboard/src/lib/buildRequest.ts`
- Test: `dashboard/src/lib/buildRequest.test.ts`

- [ ] **Step 1: Create `dashboard/src/components/spec-form/types.ts`**

```typescript
export type IndicatorType =
  | 'momentum'
  | 'sma'
  | 'rsi'
  | 'volatility'
  | 'zscore'

export interface IndicatorRow {
  type: IndicatorType
  id: string
  param: number // lookback (momentum/volatility/zscore) or period (sma/rsi)
  sourceId: string // used only when type === 'zscore'
}

export type SizingScheme = 'equal_weight' | 'inverse_vol' | 'fixed_fraction'

export interface SpecFormState {
  name: string
  universe: string[]
  benchmark: string
  start: string // 'YYYY-MM-DD'
  end: string
  startingCash: number
  indicators: IndicatorRow[]
  rankBy: string
  longTop: number
  shortBottom: number
  sizingScheme: SizingScheme
  grossLeverage: number
  fraction: number
  volIndicatorId: string
  rebalance: 'daily' | 'weekly'
  feeBps: number
  slippageBps: number
}

export const INITIAL_FORM_STATE: SpecFormState = {
  name: '',
  universe: [],
  benchmark: 'BTC/USDT',
  start: '2021-01-01',
  end: '2024-12-31',
  startingCash: 10000,
  indicators: [{ type: 'momentum', id: 'm1', param: 20, sourceId: '' }],
  rankBy: 'm1',
  longTop: 3,
  shortBottom: 0,
  sizingScheme: 'equal_weight',
  grossLeverage: 1.0,
  fraction: 0.1,
  volIndicatorId: '',
  rebalance: 'daily',
  feeBps: 10,
  slippageBps: 5,
}
```

- [ ] **Step 2: Write the failing test**

`dashboard/src/lib/buildRequest.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { buildCreateRequest, indicatorToApi } from './buildRequest'
import { INITIAL_FORM_STATE } from '../components/spec-form/types'
import type { SpecFormState } from '../components/spec-form/types'

describe('indicatorToApi', () => {
  it('uses lookback for momentum and volatility', () => {
    expect(indicatorToApi({ type: 'momentum', id: 'm1', param: 20, sourceId: '' }))
      .toEqual({ type: 'momentum', id: 'm1', lookback: 20 })
    expect(indicatorToApi({ type: 'volatility', id: 'v1', param: 30, sourceId: '' }))
      .toEqual({ type: 'volatility', id: 'v1', lookback: 30 })
  })

  it('uses period for sma and rsi', () => {
    expect(indicatorToApi({ type: 'sma', id: 's1', param: 50, sourceId: '' }))
      .toEqual({ type: 'sma', id: 's1', period: 50 })
    expect(indicatorToApi({ type: 'rsi', id: 'r1', param: 14, sourceId: '' }))
      .toEqual({ type: 'rsi', id: 'r1', period: 14 })
  })

  it('uses source_id and lookback for zscore', () => {
    expect(indicatorToApi({ type: 'zscore', id: 'z1', param: 10, sourceId: 'm1' }))
      .toEqual({ type: 'zscore', id: 'z1', source_id: 'm1', lookback: 10 })
  })
})

describe('buildCreateRequest', () => {
  it('builds a valid cross-sectional request from the initial state', () => {
    const state: SpecFormState = {
      ...INITIAL_FORM_STATE,
      name: 'momentum_2024',
      universe: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    }
    const req = buildCreateRequest(state)
    expect(req.starting_cash).toBe(10000)
    expect(req.spec).toMatchObject({
      name: 'momentum_2024',
      universe: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      indicators: [{ type: 'momentum', id: 'm1', lookback: 20 }],
      selection: {
        mode: 'cross_sectional',
        rank_by: 'm1',
        long_top: 3,
        short_bottom: 0,
      },
      rebalance: 'daily',
      costs: { fee_bps: 10, slippage_bps: 5 },
      start: '2021-01-01',
      end: '2024-12-31',
      benchmark: 'BTC/USDT',
    })
  })

  it('omits vol_indicator_id unless the scheme is inverse_vol', () => {
    const eq = buildCreateRequest({ ...INITIAL_FORM_STATE, name: 'x', universe: ['BTC/USDT'] })
    expect((eq.spec.sizing as Record<string, unknown>).vol_indicator_id).toBeUndefined()

    const iv = buildCreateRequest({
      ...INITIAL_FORM_STATE,
      name: 'x',
      universe: ['BTC/USDT'],
      sizingScheme: 'inverse_vol',
      volIndicatorId: 'v1',
    })
    expect((iv.spec.sizing as Record<string, unknown>).vol_indicator_id).toBe('v1')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/lib/buildRequest.test.ts`
Expected: FAIL — cannot resolve `./buildRequest`.

- [ ] **Step 4: Create `dashboard/src/lib/buildRequest.ts`**

```typescript
import type {
  CreateBacktestRequest,
} from '../types'
import type {
  IndicatorRow,
  SpecFormState,
} from '../components/spec-form/types'

export function indicatorToApi(row: IndicatorRow): Record<string, unknown> {
  switch (row.type) {
    case 'momentum':
    case 'volatility':
      return { type: row.type, id: row.id, lookback: row.param }
    case 'sma':
    case 'rsi':
      return { type: row.type, id: row.id, period: row.param }
    case 'zscore':
      return {
        type: 'zscore',
        id: row.id,
        source_id: row.sourceId,
        lookback: row.param,
      }
  }
}

export function buildCreateRequest(
  state: SpecFormState,
): CreateBacktestRequest {
  const sizing: Record<string, unknown> = {
    scheme: state.sizingScheme,
    gross_leverage: state.grossLeverage,
    fraction: state.fraction,
  }
  if (state.sizingScheme === 'inverse_vol') {
    sizing.vol_indicator_id = state.volIndicatorId
  }

  return {
    spec: {
      name: state.name,
      universe: state.universe,
      indicators: state.indicators.map(indicatorToApi),
      selection: {
        mode: 'cross_sectional',
        rank_by: state.rankBy,
        long_top: state.longTop,
        short_bottom: state.shortBottom,
      },
      sizing,
      rebalance: state.rebalance,
      costs: { fee_bps: state.feeBps, slippage_bps: state.slippageBps },
      start: state.start,
      end: state.end,
      benchmark: state.benchmark,
    },
    starting_cash: state.startingCash,
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/lib/buildRequest.test.ts`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/spec-form/types.ts dashboard/src/lib/buildRequest.ts dashboard/src/lib/buildRequest.test.ts
git commit -m "feat(dashboard): add spec-form state types and the buildRequest transform"
```

---

## Task 6: Design tokens, global styles, NavBar, and routing shell

**Files:**
- Create: `dashboard/src/styles/tokens.css`, `dashboard/src/styles/global.css`, `dashboard/src/components/NavBar.tsx`
- Modify: `dashboard/src/App.tsx`, `dashboard/src/main.tsx`
- Create: `dashboard/src/pages/NewRunPage.tsx`, `dashboard/src/pages/HistoryPage.tsx`, `dashboard/src/pages/ResultPage.tsx` (stubs)
- Test: `dashboard/src/components/NavBar.test.tsx`

- [ ] **Step 1: Create `dashboard/src/styles/tokens.css`**

```css
:root {
  --color-bg: #0f0f1a;
  --color-surface: #1a1a2e;
  --color-surface-2: #1e1b40;
  --color-text: #ffffff;
  --color-text-muted: #aaaaaa;
  --color-border: #2a2a3a;
  --color-accent: #7c6fff;
  --color-pos: #4ade80;
  --color-neg: #f87171;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;

  --radius: 8px;
  --text-sm: 0.85rem;
  --text-base: 1rem;
  --text-lg: 1.4rem;
  --text-xl: 2rem;
}
```

- [ ] **Step 2: Create `dashboard/src/styles/global.css`**

```css
@import './tokens.css';

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}

a { color: inherit; text-decoration: none; }

.container { max-width: 1100px; margin: 0 auto; padding: var(--space-4); }

.navbar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.navbar .brand { color: var(--color-accent); font-weight: 700; }
.navbar a.active { border-bottom: 2px solid var(--color-accent); padding-bottom: 2px; }
.navbar a { color: var(--color-text-muted); }

.pos { color: var(--color-pos); }
.neg { color: var(--color-neg); }

button {
  font: inherit;
  cursor: pointer;
  border: none;
  border-radius: var(--radius);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}
button.primary { background: var(--color-accent); color: #fff; font-weight: 600; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 3: Write the failing test**

`dashboard/src/components/NavBar.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NavBar } from './NavBar'

describe('NavBar', () => {
  it('renders the brand and both nav links', () => {
    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>,
    )
    expect(screen.getByText('HedgeFund Sim')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New Run' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'History' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/components/NavBar.test.tsx`
Expected: FAIL — cannot resolve `./NavBar`.

- [ ] **Step 5: Create `dashboard/src/components/NavBar.tsx`**

```tsx
import { NavLink } from 'react-router-dom'

export function NavBar() {
  return (
    <nav className="navbar">
      <span className="brand">HedgeFund Sim</span>
      <NavLink to="/" end>New Run</NavLink>
      <NavLink to="/history">History</NavLink>
    </nav>
  )
}
```

- [ ] **Step 6: Create page stubs so the app compiles**

`dashboard/src/pages/NewRunPage.tsx`:

```tsx
export function NewRunPage() {
  return <h2>New Run</h2>
}
```

`dashboard/src/pages/HistoryPage.tsx`:

```tsx
export function HistoryPage() {
  return <h2>History</h2>
}
```

`dashboard/src/pages/ResultPage.tsx`:

```tsx
export function ResultPage() {
  return <h2>Result</h2>
}
```

- [ ] **Step 7: Replace `dashboard/src/App.tsx` with the routing shell**

```tsx
import { Routes, Route } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { NewRunPage } from './pages/NewRunPage'
import { HistoryPage } from './pages/HistoryPage'
import { ResultPage } from './pages/ResultPage'

export default function App() {
  return (
    <>
      <NavBar />
      <main className="container">
        <Routes>
          <Route path="/" element={<NewRunPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/backtests/:id" element={<ResultPage />} />
        </Routes>
      </main>
    </>
  )
}
```

- [ ] **Step 8: Update `dashboard/src/main.tsx` to add the router, query client, and global styles**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './styles/global.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 9: Run the test and the build to verify both pass**

Run: `cd dashboard && npx vitest run src/components/NavBar.test.tsx`
Expected: 1 passed.

Run: `cd dashboard && npm run build`
Expected: build succeeds (all imports resolve).

- [ ] **Step 10: Commit**

```bash
git add dashboard/src/styles/ dashboard/src/components/NavBar.tsx dashboard/src/components/NavBar.test.tsx dashboard/src/App.tsx dashboard/src/main.tsx dashboard/src/pages/
git commit -m "feat(dashboard): add design tokens, NavBar, and routing shell"
```

---

## Task 7: SpecForm wizard shell + Step 1 (Strategy)

**Files:**
- Create: `dashboard/src/components/spec-form/SpecForm.tsx`, `dashboard/src/components/spec-form/Step1Strategy.tsx`
- Modify: `dashboard/src/styles/global.css`
- Test: `dashboard/src/components/spec-form/SpecForm.test.tsx`

- [ ] **Step 1: Create `dashboard/src/components/spec-form/Step1Strategy.tsx`**

```tsx
import { SYMBOLS } from '../../constants'
import type { SpecFormState } from './types'

interface Props {
  state: SpecFormState
  update: (patch: Partial<SpecFormState>) => void
}

export function Step1Strategy({ state, update }: Props) {
  function toggleSymbol(sym: string) {
    const next = state.universe.includes(sym)
      ? state.universe.filter((s) => s !== sym)
      : [...state.universe, sym]
    update({ universe: next })
  }

  return (
    <div className="step">
      <label>
        Name
        <input
          value={state.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </label>

      <fieldset>
        <legend>Universe</legend>
        <div className="symbol-grid">
          {SYMBOLS.map((sym) => (
            <button
              key={sym}
              type="button"
              className={state.universe.includes(sym) ? 'primary' : ''}
              onClick={() => toggleSymbol(sym)}
            >
              {sym}
            </button>
          ))}
        </div>
      </fieldset>

      <label>
        Benchmark
        <select
          value={state.benchmark}
          onChange={(e) => update({ benchmark: e.target.value })}
        >
          {SYMBOLS.map((sym) => <option key={sym} value={sym}>{sym}</option>)}
        </select>
      </label>

      <label>
        Start date
        <input
          type="date"
          value={state.start}
          onChange={(e) => update({ start: e.target.value })}
        />
      </label>

      <label>
        End date
        <input
          type="date"
          value={state.end}
          onChange={(e) => update({ end: e.target.value })}
        />
      </label>

      <label>
        Starting cash
        <input
          type="number"
          value={state.startingCash}
          onChange={(e) => update({ startingCash: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
```

- [ ] **Step 2: Write the failing test**

`dashboard/src/components/spec-form/SpecForm.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SpecForm } from './SpecForm'

describe('SpecForm', () => {
  it('starts on Step 1 (Strategy) and shows the name field', () => {
    render(<SpecForm onSubmit={vi.fn()} pending={false} />)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('advances to Step 2 when Next is clicked', async () => {
    const user = userEvent.setup()
    render(<SpecForm onSubmit={vi.fn()} pending={false} />)
    await user.click(screen.getByRole('button', { name: 'Next →' }))
    expect(screen.getByText('Step 2 — Indicators')).toBeInTheDocument()
  })

  it('goes back to Step 1 from Step 2', async () => {
    const user = userEvent.setup()
    render(<SpecForm onSubmit={vi.fn()} pending={false} />)
    await user.click(screen.getByRole('button', { name: 'Next →' }))
    await user.click(screen.getByRole('button', { name: '← Back' }))
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/components/spec-form/SpecForm.test.tsx`
Expected: FAIL — cannot resolve `./SpecForm`.

- [ ] **Step 4: Create `dashboard/src/components/spec-form/SpecForm.tsx`**

The Step2/3/4 components are added in later tasks. To keep this task self-contained and compiling, this version renders Step 1 plus inline placeholders for steps 2–4 (replaced in Tasks 8–9). The step labels (`Step 2 — Indicators`, etc.) are asserted by tests, so define them here.

```tsx
import { useState } from 'react'
import { INITIAL_FORM_STATE } from './types'
import type { SpecFormState } from './types'
import { buildCreateRequest } from '../../lib/buildRequest'
import type { CreateBacktestRequest } from '../../types'
import { Step1Strategy } from './Step1Strategy'

interface Props {
  onSubmit: (req: CreateBacktestRequest) => void
  pending: boolean
}

const STEP_LABELS = [
  'Step 1 — Strategy',
  'Step 2 — Indicators',
  'Step 3 — Selection',
  'Step 4 — Sizing & Costs',
]

export function SpecForm({ onSubmit, pending }: Props) {
  const [step, setStep] = useState(0)
  const [state, setState] = useState<SpecFormState>(INITIAL_FORM_STATE)

  function update(patch: Partial<SpecFormState>) {
    setState((prev) => ({ ...prev, ...patch }))
  }

  function handleSubmit() {
    onSubmit(buildCreateRequest(state))
  }

  return (
    <div className="spec-form">
      <aside className="steps">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className={i === step ? 'step-active' : ''}>
            {label}
          </div>
        ))}
      </aside>

      <section className="step-body">
        <h3>{STEP_LABELS[step]}</h3>

        {step === 0 && <Step1Strategy state={state} update={update} />}
        {step === 1 && <p>Indicators step (added in Task 8)</p>}
        {step === 2 && <p>Selection step (added in Task 9)</p>}
        {step === 3 && <p>Sizing step (added in Task 9)</p>}

        <div className="step-nav">
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)}>
              ← Back
            </button>
          )}
          {step < STEP_LABELS.length - 1 && (
            <button type="button" onClick={() => setStep((s) => s + 1)}>
              Next →
            </button>
          )}
          {step === STEP_LABELS.length - 1 && (
            <button
              type="button"
              className="primary"
              disabled={pending}
              onClick={handleSubmit}
            >
              {pending ? 'Running…' : 'Run Backtest →'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/components/spec-form/SpecForm.test.tsx`
Expected: 3 passed.

- [ ] **Step 6: Add spec-form styles to `dashboard/src/styles/global.css`**

Append:

```css
.spec-form { display: flex; gap: var(--space-4); }
.spec-form .steps { width: 180px; display: flex; flex-direction: column; gap: var(--space-2); }
.spec-form .steps > div { color: var(--color-text-muted); padding: var(--space-2); border-radius: var(--radius); }
.spec-form .steps .step-active { color: var(--color-accent); background: var(--color-surface); }
.spec-form .step-body { flex: 1; }
.step { display: flex; flex-direction: column; gap: var(--space-3); }
.step label { display: flex; flex-direction: column; gap: var(--space-1); color: var(--color-text-muted); }
.step input, .step select { background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius); padding: var(--space-2); }
.symbol-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-1); }
.step-nav { display: flex; gap: var(--space-2); margin-top: var(--space-4); }
.indicator-row { display: flex; gap: var(--space-2); align-items: center; margin-bottom: var(--space-2); }
```

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/components/spec-form/SpecForm.tsx dashboard/src/components/spec-form/Step1Strategy.tsx dashboard/src/components/spec-form/SpecForm.test.tsx dashboard/src/styles/global.css
git commit -m "feat(dashboard): add SpecForm wizard shell and Step 1 strategy fields"
```

---

## Task 8: Step 2 — Indicators (dynamic rows)

**Files:**
- Create: `dashboard/src/components/spec-form/Step2Indicators.tsx`
- Modify: `dashboard/src/components/spec-form/SpecForm.tsx` (wire Step 2)
- Test: `dashboard/src/components/spec-form/Step2Indicators.test.tsx`

- [ ] **Step 1: Write the failing test**

`dashboard/src/components/spec-form/Step2Indicators.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Step2Indicators } from './Step2Indicators'
import { INITIAL_FORM_STATE } from './types'

describe('Step2Indicators', () => {
  it('renders one indicator row from the initial state', () => {
    render(<Step2Indicators state={INITIAL_FORM_STATE} update={vi.fn()} />)
    expect(screen.getByDisplayValue('m1')).toBeInTheDocument()
  })

  it('adds an indicator row with an auto-incremented id when Add is clicked', async () => {
    const user = userEvent.setup()
    const update = vi.fn()
    render(<Step2Indicators state={INITIAL_FORM_STATE} update={update} />)
    await user.click(screen.getByRole('button', { name: '+ Add indicator' }))
    expect(update).toHaveBeenCalledWith({
      indicators: [
        ...INITIAL_FORM_STATE.indicators,
        { type: 'momentum', id: 'm2', param: 20, sourceId: '' },
      ],
    })
  })

  it('removes a row when its remove button is clicked', async () => {
    const user = userEvent.setup()
    const update = vi.fn()
    const state = {
      ...INITIAL_FORM_STATE,
      indicators: [
        { type: 'momentum' as const, id: 'm1', param: 20, sourceId: '' },
        { type: 'sma' as const, id: 's1', param: 50, sourceId: '' },
      ],
    }
    render(<Step2Indicators state={state} update={update} />)
    await user.click(screen.getAllByRole('button', { name: '×' })[0])
    expect(update).toHaveBeenCalledWith({
      indicators: [{ type: 'sma', id: 's1', param: 50, sourceId: '' }],
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/components/spec-form/Step2Indicators.test.tsx`
Expected: FAIL — cannot resolve `./Step2Indicators`.

- [ ] **Step 3: Create `dashboard/src/components/spec-form/Step2Indicators.tsx`**

```tsx
import type { IndicatorRow, IndicatorType, SpecFormState } from './types'

interface Props {
  state: SpecFormState
  update: (patch: Partial<SpecFormState>) => void
}

const TYPES: IndicatorType[] = ['momentum', 'sma', 'rsi', 'volatility', 'zscore']

function paramLabel(type: IndicatorType): string {
  return type === 'sma' || type === 'rsi' ? 'period' : 'lookback'
}

export function Step2Indicators({ state, update }: Props) {
  function setRow(index: number, patch: Partial<IndicatorRow>) {
    const next = state.indicators.map((row, i) =>
      i === index ? { ...row, ...patch } : row,
    )
    update({ indicators: next })
  }

  function addRow() {
    const nextId = `m${state.indicators.length + 1}`
    update({
      indicators: [
        ...state.indicators,
        { type: 'momentum', id: nextId, param: 20, sourceId: '' },
      ],
    })
  }

  function removeRow(index: number) {
    update({ indicators: state.indicators.filter((_, i) => i !== index) })
  }

  return (
    <div className="step">
      {state.indicators.map((row, i) => (
        <div className="indicator-row" key={i}>
          <select
            aria-label="type"
            value={row.type}
            onChange={(e) => setRow(i, { type: e.target.value as IndicatorType })}
          >
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            aria-label="id"
            value={row.id}
            onChange={(e) => setRow(i, { id: e.target.value })}
          />
          <input
            aria-label={paramLabel(row.type)}
            type="number"
            value={row.param}
            onChange={(e) => setRow(i, { param: Number(e.target.value) })}
          />
          {row.type === 'zscore' && (
            <select
              aria-label="source_id"
              value={row.sourceId}
              onChange={(e) => setRow(i, { sourceId: e.target.value })}
            >
              <option value="">source…</option>
              {state.indicators
                .filter((other) => other.id !== row.id)
                .map((other) => (
                  <option key={other.id} value={other.id}>{other.id}</option>
                ))}
            </select>
          )}
          <button type="button" onClick={() => removeRow(i)}>×</button>
        </div>
      ))}
      <button type="button" onClick={addRow}>+ Add indicator</button>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/components/spec-form/Step2Indicators.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Wire Step 2 into `SpecForm.tsx`**

In `dashboard/src/components/spec-form/SpecForm.tsx`, add the import after the `Step1Strategy` import:

```tsx
import { Step2Indicators } from './Step2Indicators'
```

Replace the line:

```tsx
        {step === 1 && <p>Indicators step (added in Task 8)</p>}
```

with:

```tsx
        {step === 1 && <Step2Indicators state={state} update={update} />}
```

- [ ] **Step 6: Re-run the SpecForm test to confirm no regression**

Run: `cd dashboard && npx vitest run src/components/spec-form/SpecForm.test.tsx`
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/components/spec-form/Step2Indicators.tsx dashboard/src/components/spec-form/Step2Indicators.test.tsx dashboard/src/components/spec-form/SpecForm.tsx
git commit -m "feat(dashboard): add Step 2 dynamic indicator rows"
```

---

## Task 9: Step 3 (Selection) + Step 4 (Sizing & Costs)

**Files:**
- Create: `dashboard/src/components/spec-form/Step3Selection.tsx`, `dashboard/src/components/spec-form/Step4Sizing.tsx`
- Modify: `dashboard/src/components/spec-form/SpecForm.tsx`
- Test: `dashboard/src/components/spec-form/Step3Selection.test.tsx`, `dashboard/src/components/spec-form/Step4Sizing.test.tsx`

- [ ] **Step 1: Write the failing test for Step 3**

`dashboard/src/components/spec-form/Step3Selection.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Step3Selection } from './Step3Selection'
import { INITIAL_FORM_STATE } from './types'

describe('Step3Selection', () => {
  it('populates the rank-by dropdown from indicator ids', () => {
    const state = {
      ...INITIAL_FORM_STATE,
      indicators: [
        { type: 'momentum' as const, id: 'm1', param: 20, sourceId: '' },
        { type: 'sma' as const, id: 's1', param: 50, sourceId: '' },
      ],
    }
    render(<Step3Selection state={state} update={vi.fn()} />)
    const select = screen.getByLabelText('Rank by') as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toEqual(['m1', 's1'])
  })

  it('updates long_top when changed', async () => {
    const user = userEvent.setup()
    const update = vi.fn()
    render(<Step3Selection state={INITIAL_FORM_STATE} update={update} />)
    const input = screen.getByLabelText('Long top N')
    await user.clear(input)
    await user.type(input, '5')
    expect(update).toHaveBeenLastCalledWith({ longTop: 5 })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd dashboard && npx vitest run src/components/spec-form/Step3Selection.test.tsx`
Expected: FAIL — cannot resolve `./Step3Selection`.

- [ ] **Step 3: Create `dashboard/src/components/spec-form/Step3Selection.tsx`**

```tsx
import type { SpecFormState } from './types'

interface Props {
  state: SpecFormState
  update: (patch: Partial<SpecFormState>) => void
}

export function Step3Selection({ state, update }: Props) {
  return (
    <div className="step">
      <label>
        Mode
        <input value="cross_sectional" readOnly />
      </label>
      <label>
        Rank by
        <select
          value={state.rankBy}
          onChange={(e) => update({ rankBy: e.target.value })}
        >
          {state.indicators.map((ind) => (
            <option key={ind.id} value={ind.id}>{ind.id}</option>
          ))}
        </select>
      </label>
      <label>
        Long top N
        <input
          type="number"
          value={state.longTop}
          onChange={(e) => update({ longTop: Number(e.target.value) })}
        />
      </label>
      <label>
        Short bottom N
        <input
          type="number"
          value={state.shortBottom}
          onChange={(e) => update({ shortBottom: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd dashboard && npx vitest run src/components/spec-form/Step3Selection.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Write the failing test for Step 4**

`dashboard/src/components/spec-form/Step4Sizing.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Step4Sizing } from './Step4Sizing'
import { INITIAL_FORM_STATE } from './types'

describe('Step4Sizing', () => {
  it('shows the vol indicator selector only for inverse_vol', () => {
    const { rerender } = render(
      <Step4Sizing state={INITIAL_FORM_STATE} update={vi.fn()} />,
    )
    expect(screen.queryByLabelText('Vol indicator')).not.toBeInTheDocument()

    rerender(
      <Step4Sizing
        state={{ ...INITIAL_FORM_STATE, sizingScheme: 'inverse_vol' }}
        update={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Vol indicator')).toBeInTheDocument()
  })

  it('updates fee bps when changed', async () => {
    const user = userEvent.setup()
    const update = vi.fn()
    render(<Step4Sizing state={INITIAL_FORM_STATE} update={update} />)
    const input = screen.getByLabelText('Fee (bps)')
    await user.clear(input)
    await user.type(input, '20')
    expect(update).toHaveBeenLastCalledWith({ feeBps: 20 })
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd dashboard && npx vitest run src/components/spec-form/Step4Sizing.test.tsx`
Expected: FAIL — cannot resolve `./Step4Sizing`.

- [ ] **Step 7: Create `dashboard/src/components/spec-form/Step4Sizing.tsx`**

```tsx
import type { SizingScheme, SpecFormState } from './types'

interface Props {
  state: SpecFormState
  update: (patch: Partial<SpecFormState>) => void
}

const SCHEMES: SizingScheme[] = ['equal_weight', 'inverse_vol', 'fixed_fraction']

export function Step4Sizing({ state, update }: Props) {
  return (
    <div className="step">
      <label>
        Sizing scheme
        <select
          value={state.sizingScheme}
          onChange={(e) => update({ sizingScheme: e.target.value as SizingScheme })}
        >
          {SCHEMES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      <label>
        Gross leverage
        <input
          type="number"
          step="0.1"
          value={state.grossLeverage}
          onChange={(e) => update({ grossLeverage: Number(e.target.value) })}
        />
      </label>

      {state.sizingScheme === 'fixed_fraction' && (
        <label>
          Fraction
          <input
            type="number"
            step="0.01"
            value={state.fraction}
            onChange={(e) => update({ fraction: Number(e.target.value) })}
          />
        </label>
      )}

      {state.sizingScheme === 'inverse_vol' && (
        <label>
          Vol indicator
          <select
            value={state.volIndicatorId}
            onChange={(e) => update({ volIndicatorId: e.target.value })}
          >
            <option value="">select…</option>
            {state.indicators.map((ind) => (
              <option key={ind.id} value={ind.id}>{ind.id}</option>
            ))}
          </select>
        </label>
      )}

      <label>
        Rebalance
        <select
          value={state.rebalance}
          onChange={(e) => update({ rebalance: e.target.value as 'daily' | 'weekly' })}
        >
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
        </select>
      </label>

      <label>
        Fee (bps)
        <input
          type="number"
          value={state.feeBps}
          onChange={(e) => update({ feeBps: Number(e.target.value) })}
        />
      </label>

      <label>
        Slippage (bps)
        <input
          type="number"
          value={state.slippageBps}
          onChange={(e) => update({ slippageBps: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd dashboard && npx vitest run src/components/spec-form/Step4Sizing.test.tsx`
Expected: 2 passed.

- [ ] **Step 9: Wire Steps 3 & 4 into `SpecForm.tsx`**

Add the imports after the `Step2Indicators` import:

```tsx
import { Step3Selection } from './Step3Selection'
import { Step4Sizing } from './Step4Sizing'
```

Replace these two lines:

```tsx
        {step === 2 && <p>Selection step (added in Task 9)</p>}
        {step === 3 && <p>Sizing step (added in Task 9)</p>}
```

with:

```tsx
        {step === 2 && <Step3Selection state={state} update={update} />}
        {step === 3 && <Step4Sizing state={state} update={update} />}
```

- [ ] **Step 10: Run the full spec-form test folder to confirm no regression**

Run: `cd dashboard && npx vitest run src/components/spec-form/`
Expected: all spec-form tests pass.

- [ ] **Step 11: Commit**

```bash
git add dashboard/src/components/spec-form/Step3Selection.tsx dashboard/src/components/spec-form/Step3Selection.test.tsx dashboard/src/components/spec-form/Step4Sizing.tsx dashboard/src/components/spec-form/Step4Sizing.test.tsx dashboard/src/components/spec-form/SpecForm.tsx
git commit -m "feat(dashboard): add Step 3 selection and Step 4 sizing/costs"
```

---

## Task 10: NewRunPage — wire the form to the POST mutation

**Files:**
- Modify: `dashboard/src/pages/NewRunPage.tsx`
- Test: `dashboard/src/pages/NewRunPage.test.tsx`

- [ ] **Step 1: Write the failing test**

`dashboard/src/pages/NewRunPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { NewRunPage } from './NewRunPage'
import * as api from '../api/backtests'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<NewRunPage />} />
          <Route path="/backtests/:id" element={<div>Result Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('NewRunPage', () => {
  it('navigates to the result page after a successful run', async () => {
    vi.spyOn(api, 'createBacktest').mockResolvedValue({
      id: 'abc-123',
      name: 'route_test',
      created_at: '2026-06-15T00:00:00Z',
      duration_ms: 7,
      metrics: { sharpe: 1.4 },
      starting_cash: 10000,
      spec: {},
      equity_curve: [['2021-01-01', 10000]],
      benchmark_curve: null,
      trade_log: [],
    })
    const user = userEvent.setup()
    renderPage()

    // Step 1 → fill name
    await user.type(screen.getByLabelText('Name'), 'route_test')
    await user.click(screen.getByRole('button', { name: 'Next →' })) // → 2
    await user.click(screen.getByRole('button', { name: 'Next →' })) // → 3
    await user.click(screen.getByRole('button', { name: 'Next →' })) // → 4
    await user.click(screen.getByRole('button', { name: 'Run Backtest →' }))

    await waitFor(() => {
      expect(screen.getByText('Result Page')).toBeInTheDocument()
    })
  })

  it('shows the API error message when the run fails', async () => {
    vi.spyOn(api, 'createBacktest').mockRejectedValue(new Error('bad spec'))
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Next →' }))
    await user.click(screen.getByRole('button', { name: 'Next →' }))
    await user.click(screen.getByRole('button', { name: 'Next →' }))
    await user.click(screen.getByRole('button', { name: 'Run Backtest →' }))

    await waitFor(() => {
      expect(screen.getByText('bad spec')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd dashboard && npx vitest run src/pages/NewRunPage.test.tsx`
Expected: FAIL — current `NewRunPage` only renders a heading.

- [ ] **Step 3: Replace `dashboard/src/pages/NewRunPage.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { SpecForm } from '../components/spec-form/SpecForm'
import { createBacktest } from '../api/backtests'
import type { CreateBacktestRequest } from '../types'

export function NewRunPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (req: CreateBacktestRequest) => createBacktest(req),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['backtests'] })
      navigate(`/backtests/${result.id}`)
    },
  })

  return (
    <div>
      <h2>New Run</h2>
      {mutation.isError && (
        <p className="neg" role="alert">{mutation.error.message}</p>
      )}
      <SpecForm
        onSubmit={(req) => mutation.mutate(req)}
        pending={mutation.isPending}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd dashboard && npx vitest run src/pages/NewRunPage.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/NewRunPage.tsx dashboard/src/pages/NewRunPage.test.tsx
git commit -m "feat(dashboard): wire NewRunPage form to the POST mutation"
```

---

## Task 11: EquityChart, MetricsPanel, TradeLogTable components

**Files:**
- Create: `dashboard/src/components/EquityChart.tsx`, `dashboard/src/components/MetricsPanel.tsx`, `dashboard/src/components/TradeLogTable.tsx`
- Modify: `dashboard/src/styles/global.css`
- Test: `dashboard/src/components/MetricsPanel.test.tsx`, `dashboard/src/components/TradeLogTable.test.tsx`

Note: Recharts renders an SVG that does not lay out in jsdom (zero width), so EquityChart is not unit-tested here — it is covered by the manual smoke in Task 13. MetricsPanel and TradeLogTable are pure DOM and are tested.

- [ ] **Step 1: Create `dashboard/src/components/EquityChart.tsx`**

```tsx
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BacktestResult } from '../types'

interface Props {
  result: BacktestResult
}

export function EquityChart({ result }: Props) {
  const benchByDate = new Map(result.benchmark_curve ?? [])
  const data = result.equity_curve.map(([date, value]) => ({
    date,
    equity: value,
    benchmark: benchByDate.get(date) ?? null,
  }))

  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" />
        <XAxis dataKey="date" stroke="#aaa" minTickGap={40} />
        <YAxis stroke="#aaa" domain={['auto', 'auto']} width={70} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3a' }}
        />
        <Line
          type="monotone"
          dataKey="equity"
          stroke="#7c6fff"
          strokeWidth={2}
          dot={false}
          name="Equity"
        />
        {result.benchmark_curve && (
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke="#888"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="Benchmark"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Write the failing test for MetricsPanel**

`dashboard/src/components/MetricsPanel.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricsPanel } from './MetricsPanel'

describe('MetricsPanel', () => {
  it('renders core metrics with human labels', () => {
    render(
      <MetricsPanel
        metrics={{ sharpe: 1.42, total_return: 0.64, max_drawdown: -0.18 }}
      />,
    )
    expect(screen.getByText('Sharpe')).toBeInTheDocument()
    expect(screen.getByText('1.42')).toBeInTheDocument()
    expect(screen.getByText('Total Return')).toBeInTheDocument()
    expect(screen.getByText('+64.00%')).toBeInTheDocument()
  })

  it('skips metric keys it does not recognize', () => {
    render(<MetricsPanel metrics={{ sharpe: 1.0, mystery_key: 9 }} />)
    expect(screen.queryByText('9')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd dashboard && npx vitest run src/components/MetricsPanel.test.tsx`
Expected: FAIL — cannot resolve `./MetricsPanel`.

- [ ] **Step 4: Create `dashboard/src/components/MetricsPanel.tsx`**

```tsx
import {
  METRIC_LABELS,
  PERCENT_METRICS,
  formatNum,
  formatPct,
  signClass,
} from '../lib/format'

interface Props {
  metrics: Record<string, number>
}

export function MetricsPanel({ metrics }: Props) {
  const rows = Object.keys(METRIC_LABELS).filter((key) => key in metrics)

  return (
    <div className="metrics-panel">
      <h3>Metrics</h3>
      {rows.map((key) => {
        const value = metrics[key]
        const isPct = PERCENT_METRICS.has(key)
        const display = isPct ? formatPct(value) : formatNum(value)
        const cls = isPct ? signClass(value) : ''
        return (
          <div className="metric-row" key={key}>
            <span className="metric-label">{METRIC_LABELS[key]}</span>
            <span className={`metric-value ${cls}`}>{display}</span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd dashboard && npx vitest run src/components/MetricsPanel.test.tsx`
Expected: 2 passed.

- [ ] **Step 6: Write the failing test for TradeLogTable**

`dashboard/src/components/TradeLogTable.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TradeLogTable } from './TradeLogTable'

const TRADES = [
  { date: '2021-01-02', symbol: 'BTC/USDT', units: 0.5, price: 30000 },
]

describe('TradeLogTable', () => {
  it('is collapsed by default and expands on click', async () => {
    const user = userEvent.setup()
    render(<TradeLogTable trades={TRADES} />)
    expect(screen.queryByText('BTC/USDT')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /trade log/i }))
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd dashboard && npx vitest run src/components/TradeLogTable.test.tsx`
Expected: FAIL — cannot resolve `./TradeLogTable`.

- [ ] **Step 8: Create `dashboard/src/components/TradeLogTable.tsx`**

```tsx
import { useState } from 'react'

interface Props {
  trades: Record<string, unknown>[]
}

const COLUMNS = ['date', 'symbol', 'units', 'price'] as const

export function TradeLogTable({ trades }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="trade-log">
      <button type="button" onClick={() => setOpen((o) => !o)}>
        {open ? '▼' : '▶'} Trade Log ({trades.length} trades)
      </button>
      {open && (
        <table>
          <thead>
            <tr>{COLUMNS.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => (
              <tr key={i}>
                {COLUMNS.map((c) => <td key={c}>{String(trade[c] ?? '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `cd dashboard && npx vitest run src/components/TradeLogTable.test.tsx`
Expected: 1 passed.

- [ ] **Step 10: Add component styles to `dashboard/src/styles/global.css`**

Append:

```css
.result-layout { display: flex; gap: var(--space-4); align-items: flex-start; }
.result-layout .chart-col { flex: 2; background: var(--color-surface); border-radius: var(--radius); padding: var(--space-3); }
.metrics-panel { flex: 1; background: var(--color-surface); border-radius: var(--radius); padding: var(--space-3); }
.metric-row { display: flex; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
.metric-label { color: var(--color-text-muted); }
.trade-log { margin-top: var(--space-4); }
.trade-log table { width: 100%; border-collapse: collapse; margin-top: var(--space-2); }
.trade-log th, .trade-log td { text-align: left; padding: var(--space-2); border-bottom: 1px solid var(--color-border); }
```

- [ ] **Step 11: Commit**

```bash
git add dashboard/src/components/EquityChart.tsx dashboard/src/components/MetricsPanel.tsx dashboard/src/components/MetricsPanel.test.tsx dashboard/src/components/TradeLogTable.tsx dashboard/src/components/TradeLogTable.test.tsx dashboard/src/styles/global.css
git commit -m "feat(dashboard): add EquityChart, MetricsPanel, and TradeLogTable"
```

---

## Task 12: ResultPage and HistoryPage (with RunCard + delete)

**Files:**
- Modify: `dashboard/src/pages/ResultPage.tsx`, `dashboard/src/pages/HistoryPage.tsx`
- Create: `dashboard/src/components/RunCard.tsx`
- Modify: `dashboard/src/styles/global.css`
- Test: `dashboard/src/pages/ResultPage.test.tsx`, `dashboard/src/components/RunCard.test.tsx`, `dashboard/src/pages/HistoryPage.test.tsx`

- [ ] **Step 1: Write the failing test for ResultPage**

`dashboard/src/pages/ResultPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ResultPage } from './ResultPage'
import * as api from '../api/backtests'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ResultPage', () => {
  it('fetches and renders the result name and metrics', async () => {
    vi.spyOn(api, 'getBacktest').mockResolvedValue({
      id: 'abc-123',
      name: 'momentum_2024',
      created_at: '2026-06-15T00:00:00Z',
      duration_ms: 7,
      metrics: { sharpe: 1.42, total_return: 0.64 },
      starting_cash: 10000,
      spec: {},
      equity_curve: [['2021-01-01', 10000], ['2021-01-02', 11000]],
      benchmark_curve: null,
      trade_log: [],
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/backtests/abc-123']}>
          <Routes>
            <Route path="/backtests/:id" element={<ResultPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('momentum_2024')).toBeInTheDocument()
    })
    expect(screen.getByText('Sharpe')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd dashboard && npx vitest run src/pages/ResultPage.test.tsx`
Expected: FAIL — current `ResultPage` renders only a heading.

- [ ] **Step 3: Replace `dashboard/src/pages/ResultPage.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { getBacktest } from '../api/backtests'
import { EquityChart } from '../components/EquityChart'
import { MetricsPanel } from '../components/MetricsPanel'
import { TradeLogTable } from '../components/TradeLogTable'

export function ResultPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['backtests', id],
    queryFn: () => getBacktest(id!),
    enabled: !!id,
  })

  if (isLoading) return <p>Loading…</p>
  if (isError) return <p className="neg">{(error as Error).message}</p>
  if (!data) return null

  return (
    <div>
      <h2>{data.name}</h2>
      <div className="result-layout">
        <div className="chart-col">
          <EquityChart result={data} />
        </div>
        <MetricsPanel metrics={data.metrics} />
      </div>
      <TradeLogTable trades={data.trade_log} />
    </div>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd dashboard && npx vitest run src/pages/ResultPage.test.tsx`
Expected: 1 passed. (Recharts logs a width/height warning in jsdom — harmless.)

- [ ] **Step 5: Write the failing test for RunCard**

`dashboard/src/components/RunCard.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { RunCard } from './RunCard'

const SUMMARY = {
  id: 'abc-123',
  name: 'momentum_2024',
  created_at: '2026-06-15T00:00:00Z',
  duration_ms: 7,
  metrics: { sharpe: 1.42, total_return: 0.64, max_drawdown: -0.18 },
}

describe('RunCard', () => {
  it('renders name and key metrics', () => {
    render(
      <MemoryRouter>
        <RunCard summary={SUMMARY} onDelete={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByText('momentum_2024')).toBeInTheDocument()
    expect(screen.getByText('1.42')).toBeInTheDocument()
    expect(screen.getByText('+64.00%')).toBeInTheDocument()
  })

  it('calls onDelete with the id when delete is clicked', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <MemoryRouter>
        <RunCard summary={SUMMARY} onDelete={onDelete} />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('abc-123')
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd dashboard && npx vitest run src/components/RunCard.test.tsx`
Expected: FAIL — cannot resolve `./RunCard`.

- [ ] **Step 7: Create `dashboard/src/components/RunCard.tsx`**

```tsx
import { Link } from 'react-router-dom'
import type { BacktestSummary } from '../types'
import { formatNum, formatPct, signClass } from '../lib/format'

interface Props {
  summary: BacktestSummary
  onDelete: (id: string) => void
}

export function RunCard({ summary, onDelete }: Props) {
  const { metrics } = summary
  const date = new Date(summary.created_at).toLocaleDateString()

  return (
    <div className="run-card">
      <Link to={`/backtests/${summary.id}`} className="run-card-title">
        {summary.name}
      </Link>
      <span className="run-card-date">{date}</span>
      <div className="run-card-metrics">
        {'sharpe' in metrics && (
          <span>SR <strong>{formatNum(metrics.sharpe)}</strong></span>
        )}
        {'total_return' in metrics && (
          <span className={signClass(metrics.total_return)}>
            {formatPct(metrics.total_return)}
          </span>
        )}
        {'max_drawdown' in metrics && (
          <span className="neg">{formatPct(metrics.max_drawdown)}</span>
        )}
      </div>
      <button type="button" onClick={() => onDelete(summary.id)}>Delete</button>
    </div>
  )
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd dashboard && npx vitest run src/components/RunCard.test.tsx`
Expected: 2 passed.

- [ ] **Step 9: Write the failing test for HistoryPage**

`dashboard/src/pages/HistoryPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { HistoryPage } from './HistoryPage'
import * as api from '../api/backtests'

beforeEach(() => {
  vi.restoreAllMocks()
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HistoryPage', () => {
  it('shows the empty state when there are no runs', async () => {
    vi.spyOn(api, 'listBacktests').mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/no runs yet/i)).toBeInTheDocument()
    })
  })

  it('renders a card per run', async () => {
    vi.spyOn(api, 'listBacktests').mockResolvedValue([
      { id: 'a', name: 'run_a', created_at: '2026-06-15T00:00:00Z', duration_ms: 5, metrics: { sharpe: 1.0 } },
      { id: 'b', name: 'run_b', created_at: '2026-06-14T00:00:00Z', duration_ms: 6, metrics: { sharpe: 2.0 } },
    ])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('run_a')).toBeInTheDocument()
    })
    expect(screen.getByText('run_b')).toBeInTheDocument()
  })
})
```

- [ ] **Step 10: Run it to verify it fails**

Run: `cd dashboard && npx vitest run src/pages/HistoryPage.test.tsx`
Expected: FAIL — current `HistoryPage` renders only a heading.

- [ ] **Step 11: Replace `dashboard/src/pages/HistoryPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteBacktest, listBacktests } from '../api/backtests'
import { RunCard } from '../components/RunCard'

export function HistoryPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['backtests'],
    queryFn: listBacktests,
  })

  const del = useMutation({
    mutationFn: (id: string) => deleteBacktest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backtests'] }),
  })

  if (isLoading) return <p>Loading…</p>
  if (isError) return <p className="neg">{(error as Error).message}</p>

  const runs = data ?? []
  if (runs.length === 0) {
    return <p>No runs yet — go to New Run to get started.</p>
  }

  return (
    <div>
      <h2>Past Runs</h2>
      <div className="run-grid">
        {runs.map((summary) => (
          <RunCard
            key={summary.id}
            summary={summary}
            onDelete={(id) => del.mutate(id)}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 12: Run it to verify it passes**

Run: `cd dashboard && npx vitest run src/pages/HistoryPage.test.tsx`
Expected: 2 passed.

- [ ] **Step 13: Add card-grid styles to `dashboard/src/styles/global.css`**

Append:

```css
.run-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3); }
@media (min-width: 900px) { .run-grid { grid-template-columns: repeat(3, 1fr); } }
.run-card { background: var(--color-surface); border-radius: var(--radius); padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
.run-card-title { color: var(--color-text); font-weight: 600; }
.run-card-date { color: var(--color-text-muted); font-size: var(--text-sm); }
.run-card-metrics { display: flex; gap: var(--space-3); font-size: var(--text-sm); }
```

- [ ] **Step 14: Commit**

```bash
git add dashboard/src/pages/ResultPage.tsx dashboard/src/pages/ResultPage.test.tsx dashboard/src/pages/HistoryPage.tsx dashboard/src/pages/HistoryPage.test.tsx dashboard/src/components/RunCard.tsx dashboard/src/components/RunCard.test.tsx dashboard/src/styles/global.css
git commit -m "feat(dashboard): add ResultPage and HistoryPage with delete"
```

---

## Task 13: Full-suite check, build, and manual smoke

**Files:**
- (no new source; verification + any small fixes)

- [ ] **Step 1: Run the full dashboard test suite**

Run: `cd dashboard && npm test`
Expected: all test files pass (api client, format, buildRequest, NavBar, the four spec-form steps + shell, NewRunPage, MetricsPanel, TradeLogTable, ResultPage, RunCard, HistoryPage).

- [ ] **Step 2: Run the production build (type-check + bundle)**

Run: `cd dashboard && npm run build`
Expected: `tsc -b` reports no type errors; Vite emits `dist/` with no errors.

- [ ] **Step 3: Manual smoke against the live backend**

This is a manual verification, not an automated test. In three terminals:

```bash
# 1. Postgres
docker-compose up -d db

# 2. API (from repo root)
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn hedgefund.api.app:app --reload

# 3. Dashboard
cd dashboard && npm run dev
```

Then open `http://localhost:5173` and verify:
1. New Run → pick a universe of 3+ symbols whose data is in the parquet cache, choose a momentum indicator, set rank_by to that indicator id, click through to Step 4, click Run Backtest.
2. The app navigates to the Result page and shows an equity curve plus a metrics panel with Sharpe and Total Return.
3. Expanding the Trade Log shows rows.
4. History shows the run as a card; clicking it reopens the result; Delete removes it.

If any wiring is broken, fix it and re-run Steps 1–2 before committing.

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add dashboard/
git commit -m "fix(dashboard): address issues found during manual smoke"
```

If no fixes were needed, skip this commit.

---

## Self-Review Notes

- **Spec coverage:** §3 stack/structure → Tasks 2–6; §4.1 New Run wizard (4 steps, real indicator/sizing/rebalance fields) → Tasks 7–10; §4.2 History (card grid, metrics only, delete, empty state) → Task 12; §4.3 Result (2/3 chart + 1/3 metrics + collapsible trade log) → Tasks 11–12; §5 API integration (apiFetch, query keys, mutations) → Tasks 3, 10, 12; §6 TS types → Task 3; §7 CORS prerequisite → Task 1; §8 dependencies → Task 2; §9 risks (CORS via Task 1; no sparkline on summary respected in RunCard; spinner on pending in SpecForm/NewRunPage; manual type mirroring).
- **Spec correction:** the design doc's indicator list (`momentum | mean_reversion`) and `monthly` rebalance do not exist in `src/hedgefund/dsl/spec.py`. The plan uses the real model: indicators `momentum | sma | rsi | volatility | zscore` (lookback vs period vs source_id handled in `indicatorToApi`), rebalance `daily | weekly`. This is intentional and noted here so the spec/plan divergence is explicit.
- **Placeholder scan:** no TBD/TODO; every code step contains complete code. The Task 7 SpecForm intentionally ships inline placeholders for steps 2–4 that are replaced in Tasks 8–9 — each replacement is shown as an exact find/replace.
- **Type consistency:** `SpecFormState`/`IndicatorRow`/`INITIAL_FORM_STATE` defined in Task 5 are used unchanged in Tasks 7–10; `buildCreateRequest`/`indicatorToApi` signatures match between Task 5 and Task 7; `BacktestResult`/`BacktestSummary`/`CreateBacktestRequest` from Task 3 are used in Tasks 5, 10–12; `MetricsPanel`/`EquityChart`/`TradeLogTable`/`RunCard` prop shapes match their call sites in the pages; `createBacktest`/`listBacktests`/`getBacktest`/`deleteBacktest` names match between Task 3 and the pages.
- **Testing approach:** highest-value pure logic (`buildCreateRequest`, `apiFetch`, format helpers) has thorough unit tests; components are tested for behavior (navigation, add/remove, delete, conditional fields) not markup; EquityChart is excluded from unit tests (Recharts needs real layout) and is covered by the Task 13 manual smoke, consistent with the web testing rule that visual components rely on visual/manual verification over brittle markup assertions.
