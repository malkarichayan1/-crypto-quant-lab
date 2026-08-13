# Pre-Launch Phase 6: Breadcrumbs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add breadcrumb navigation to the four nested `/app` pages that actually have real hierarchy to show — `AssetPage`, `ResultPage`, `AgentResultPage`, and `PaperLivePage` — matching the spec's `Home > Markets > {symbol}` / `Home > Strategy Lab > Backtests > {id}` pattern.

**Architecture:** One generic, reusable `Breadcrumbs` component (`items: { label: string; to?: string }[]`) rendered at the top of each of the four pages. The last item is always the current page (non-clickable, `aria-current="page"`); middle items without a `to` (like "Strategy Lab", which has no single hub route — `Backtests`/`Research`/`Paper Sessions` are three separate sidebar entries) render as plain non-clickable labels.

**Tech Stack:** React 18, react-router-dom, `lucide-react` (already a dependency). No new dependencies.

Reference spec: `docs/superpowers/specs/2026-08-13-pre-launch-seo-marketing-design.md`, section 5.

**Depends on:** Phase 1 — specifically its Task 9, which fixes every in-page link (including inside these four files) to point at `/app/...` paths. The code snippets in this plan assume Task 9 has already landed; if it hasn't, the `Link`/`to` values shown here won't match what's currently in those files (they'll still have the pre-split paths) — apply Phase 1 first, or adjust by eye.

---

### Task 1: Breadcrumbs component

**Files:**
- Create: `dashboard/src/components/Breadcrumbs.tsx`
- Test: `dashboard/src/components/Breadcrumbs.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/components/Breadcrumbs.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Breadcrumbs, type Crumb } from './Breadcrumbs'

function renderCrumbs(items: Crumb[]) {
  return render(
    <MemoryRouter>
      <Breadcrumbs items={items} />
    </MemoryRouter>,
  )
}

describe('Breadcrumbs', () => {
  const items: Crumb[] = [
    { label: 'Dashboard', to: '/app' },
    { label: 'Markets', to: '/app/markets' },
    { label: 'BTC' },
  ]

  it('renders every label', () => {
    renderCrumbs(items)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Markets')).toBeInTheDocument()
    expect(screen.getByText('BTC')).toBeInTheDocument()
  })

  it('renders a link for every item that has a `to`, except never for the last item', () => {
    renderCrumbs(items)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/app')
    expect(screen.getByRole('link', { name: 'Markets' })).toHaveAttribute(
      'href',
      '/app/markets',
    )
    expect(screen.queryByRole('link', { name: 'BTC' })).not.toBeInTheDocument()
  })

  it('marks the last item as the current page and does not link it even if it has a `to`', () => {
    renderCrumbs([{ label: 'Dashboard', to: '/app' }, { label: 'BTC', to: '/app/coins/BTC' }])
    const last = screen.getByText('BTC')
    expect(last).toHaveAttribute('aria-current', 'page')
    expect(last.tagName).toBe('SPAN')
  })

  it('renders a non-clickable label for a middle item with no `to`', () => {
    renderCrumbs([
      { label: 'Dashboard', to: '/app' },
      { label: 'Strategy Lab' },
      { label: 'Backtests', to: '/app/lab/backtests/history' },
      { label: 'momentum_2024' },
    ])
    expect(screen.queryByRole('link', { name: 'Strategy Lab' })).not.toBeInTheDocument()
    expect(screen.getByText('Strategy Lab')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/components/Breadcrumbs.test.tsx`
Expected: FAIL — `Cannot find module './Breadcrumbs'`

- [ ] **Step 3: Write the implementation**

```tsx
// dashboard/src/components/Breadcrumbs.tsx
import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export type Crumb = { label: string; to?: string }

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <Fragment key={item.label}>
            {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />}
            {item.to && !isLast ? (
              <Link to={item.to} className="hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={isLast ? 'page' : undefined}
                className={isLast ? 'font-medium text-foreground' : undefined}
              >
                {item.label}
              </span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/components/Breadcrumbs.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/Breadcrumbs.tsx dashboard/src/components/Breadcrumbs.test.tsx
git commit -m "feat(nav): add reusable Breadcrumbs component"
```

---

### Task 2: Breadcrumbs on AssetPage (Dashboard > Markets > {symbol})

**Files:**
- Modify: `dashboard/src/pages/AssetPage.tsx`
- Modify: `dashboard/src/pages/AssetPage.test.tsx`

**Depends on:** Task 1.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/src/pages/AssetPage.test.tsx` (inside `describe('AssetPage', ...)`,
using the file's existing `renderAt` helper):

```tsx
  it('renders a breadcrumb trail to the coin', async () => {
    renderAt('/coins/BTC')
    expect(await screen.findByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Markets' })).toHaveAttribute(
      'href',
      '/app/markets',
    )
    expect(screen.getByText('BTC', { selector: 'span' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/pages/AssetPage.test.tsx`
Expected: FAIL — no breadcrumb nav rendered yet

- [ ] **Step 3: Add the import and render it**

In `dashboard/src/pages/AssetPage.tsx`, add the import alongside the other
component imports:

```tsx
import { Breadcrumbs } from '../components/Breadcrumbs'
```

And render it as the first child of the main return's `<div>` (after the
early-return loading/error branches, in the success-path return only):

```tsx
  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/app' },
          { label: 'Markets', to: '/app/markets' },
          { label: symbol },
        ]}
      />
      {(assetsQuery.data?.stale || candlesQuery.data?.stale) && <StalePricesBanner />}
```

(everything below `<StalePricesBanner />` stays exactly as it already is)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/pages/AssetPage.test.tsx`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/AssetPage.tsx dashboard/src/pages/AssetPage.test.tsx
git commit -m "feat(nav): add breadcrumbs to AssetPage"
```

---

### Task 3: Breadcrumbs on ResultPage (Dashboard > Strategy Lab > Backtests > {name})

**Files:**
- Modify: `dashboard/src/pages/ResultPage.tsx`
- Modify: `dashboard/src/pages/ResultPage.test.tsx`

**Depends on:** Task 1.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/src/pages/ResultPage.test.tsx`:

```tsx
  it('renders a breadcrumb trail to the backtest result', async () => {
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
    expect(await screen.findByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Backtests' })).toHaveAttribute(
      'href',
      '/app/lab/backtests/history',
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/pages/ResultPage.test.tsx`
Expected: FAIL — no breadcrumb nav rendered yet

- [ ] **Step 3: Add the import and render it**

In `dashboard/src/pages/ResultPage.tsx`, add the import:

```tsx
import { Breadcrumbs } from '../components/Breadcrumbs'
```

And render it as the first child of the return:

```tsx
  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/app' },
          { label: 'Strategy Lab' },
          { label: 'Backtests', to: '/app/lab/backtests/history' },
          { label: data.name },
        ]}
      />
      <h2>{data.name}</h2>
```

(everything below `<h2>{data.name}</h2>` stays exactly as it already is,
including the `Paper trade this →` link, which Phase 1 Task 9 already
repointed at `/app/lab/paper?source_backtest_id=${id}`)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/pages/ResultPage.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/ResultPage.tsx dashboard/src/pages/ResultPage.test.tsx
git commit -m "feat(nav): add breadcrumbs to ResultPage"
```

---

### Task 4: Breadcrumbs on AgentResultPage (Dashboard > Strategy Lab > Research > {goal})

**Files:**
- Modify: `dashboard/src/pages/AgentResultPage.tsx`
- Modify: `dashboard/src/pages/AgentResultPage.test.tsx`

**Depends on:** Task 1.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/src/pages/AgentResultPage.test.tsx` (uses the file's
existing `wrap` helper):

```tsx
  it('renders a breadcrumb trail to the research run', async () => {
    wrap(<AgentResultPage />)
    expect(await screen.findByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute(
      'href',
      '/app/lab/research/history',
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/pages/AgentResultPage.test.tsx`
Expected: FAIL — no breadcrumb nav rendered yet

- [ ] **Step 3: Add the import and render it**

In `dashboard/src/pages/AgentResultPage.tsx`, add the import:

```tsx
import { Breadcrumbs } from '../components/Breadcrumbs'
```

And render it as the first child of the return (this file's `Link` import
already exists from Phase 1 Task 9's fix to the `winner_backtest_id` link):

```tsx
  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/app' },
          { label: 'Strategy Lab' },
          { label: 'Research', to: '/app/lab/research/history' },
          { label: run?.goal ?? 'Research Run' },
        ]}
      />
      <div className="agent-run-header">
```

(everything from `<div className="agent-run-header">` down stays exactly
as it already is)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/pages/AgentResultPage.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/AgentResultPage.tsx dashboard/src/pages/AgentResultPage.test.tsx
git commit -m "feat(nav): add breadcrumbs to AgentResultPage"
```

---

### Task 5: Breadcrumbs on PaperLivePage (Dashboard > Strategy Lab > Paper Sessions > {label})

**Files:**
- Modify: `dashboard/src/pages/PaperLivePage.tsx`
- Modify: `dashboard/src/pages/PaperLivePage.test.tsx`

**Depends on:** Task 1.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/src/pages/PaperLivePage.test.tsx` (uses the file's
existing `wrap` helper):

```tsx
  it('renders a breadcrumb trail to the paper session', async () => {
    wrap()
    expect(await screen.findByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Paper Sessions' })).toHaveAttribute(
      'href',
      '/app/lab/paper/history',
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/pages/PaperLivePage.test.tsx`
Expected: FAIL — no breadcrumb nav rendered yet

- [ ] **Step 3: Add the import and render it**

In `dashboard/src/pages/PaperLivePage.tsx`, add the import:

```tsx
import { Breadcrumbs } from '../components/Breadcrumbs'
```

And render it as the first child of the return:

```tsx
  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/app' },
          { label: 'Strategy Lab' },
          { label: 'Paper Sessions', to: '/app/lab/paper/history' },
          { label: data.label },
        ]}
      />
      <div className="paper-live-header">
```

(everything from `<div className="paper-live-header">` down stays exactly
as it already is)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/pages/PaperLivePage.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/PaperLivePage.tsx dashboard/src/pages/PaperLivePage.test.tsx
git commit -m "feat(nav): add breadcrumbs to PaperLivePage"
```

---

## Phase 6 exit check

```bash
cd dashboard && npm run build && npm test
```

Manually smoke-test in the dev server: navigate to a coin page, a backtest
result, a research run, and a live paper session; confirm each breadcrumb
trail renders, every non-last crumb is clickable and lands where labeled,
and the last crumb visually reads as the current page (not a link).

---

## All six phases: final combined check

Once Phases 1–6 are all implemented on this branch:

```bash
pytest
cd dashboard && npm run build && npm test
```

Then walk through the manual exit checks from all six phase plans in order
(they build on each other) before merging `feature/prelaunch-seo-marketing`.
