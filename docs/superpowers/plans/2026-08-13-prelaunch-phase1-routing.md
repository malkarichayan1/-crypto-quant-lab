# Pre-Launch Phase 1: Site Split & Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single-tree app into a public landing page at `/` and the existing dashboard moved to `/app/*`, with every currently-working link redirected, a real custom 404, and `robots.txt`/`sitemap.xml`.

**Architecture:** `App.tsx` gains a new unwrapped `/` route (`LandingPage`, no `AppShell`) and moves the entire existing `AppShell` route tree one level down to `/app`. A small data-driven redirect table (`legacyRedirects.ts`) replaces the old hand-enumerated `<Navigate>` blocks so ~20 old paths (both the routes that were live today, and the pre-existing `/history`/`/research*`/`/paper*` aliases) all resolve into `/app/...`. An unmatched-path catch-all renders a real `NotFoundPage` with a `noindex` meta tag, since Vercel's SPA rewrite always returns HTTP 200.

**Tech Stack:** React 18, react-router-dom v6, Vitest + React Testing Library, Tailwind v4 / shadcn `Button` component. No new dependencies.

Reference spec: `docs/superpowers/specs/2026-08-13-pre-launch-seo-marketing-design.md`, section 5.

---

### Task 1: Legacy redirect table

**Files:**
- Create: `dashboard/src/routes/legacyRedirects.ts`
- Test: `dashboard/src/routes/legacyRedirects.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// dashboard/src/routes/legacyRedirects.test.ts
import { describe, expect, it } from 'vitest'
import { PARAM_REDIRECTS, STATIC_REDIRECTS } from './legacyRedirects'

describe('legacyRedirects', () => {
  it('every static redirect target is under /app', () => {
    for (const to of Object.values(STATIC_REDIRECTS)) {
      expect(to.startsWith('/app/')).toBe(true)
    }
  })

  it('every param redirect target is under /app', () => {
    for (const { to } of PARAM_REDIRECTS) {
      expect(to.startsWith('/app/')).toBe(true)
    }
  })

  it('has no source path listed twice across the two tables', () => {
    const staticFroms = Object.keys(STATIC_REDIRECTS)
    const paramFroms = PARAM_REDIRECTS.map((r) => r.from)
    const all = [...staticFroms, ...paramFroms]
    expect(new Set(all).size).toBe(all.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/routes/legacyRedirects.test.ts`
Expected: FAIL — `Cannot find module './legacyRedirects'`

- [ ] **Step 3: Write the redirect table**

```ts
// dashboard/src/routes/legacyRedirects.ts
/**
 * Every path that resolved to real content before the 2026-08-13 pre-launch
 * restructure moved the whole dashboard under `/app`, mapped to its new
 * home. Two generations of alias are mixed in on purpose:
 *   - paths that were live at the repo root right up until this change
 *     (e.g. `/markets`, `/lab/backtests`)
 *   - the older `/history`, `/research*`, `/paper/history` aliases that
 *     already existed before this change, from the original Strategy Lab
 *     move — these keep working too, just pointed at the new /app home.
 *
 * `/paper` (the bare path, no `/history`) is handled separately in App.tsx
 * because it must preserve the query string (`source_backtest_id`) across
 * the redirect, which a plain string-to-string table can't express.
 */
export const STATIC_REDIRECTS: Record<string, string> = {
  '/markets': '/app/markets',
  '/portfolio': '/app/portfolio',
  '/leaderboard': '/app/leaderboard',
  '/news': '/app/news',
  '/settings': '/app/settings',
  '/lab/backtests': '/app/lab/backtests',
  '/lab/backtests/history': '/app/lab/backtests/history',
  '/lab/research': '/app/lab/research',
  '/lab/research/history': '/app/lab/research/history',
  '/lab/paper': '/app/lab/paper',
  '/lab/paper/history': '/app/lab/paper/history',
  '/history': '/app/lab/backtests/history',
  '/research': '/app/lab/research',
  '/research/history': '/app/lab/research/history',
  '/paper/history': '/app/lab/paper/history',
}

export const PARAM_REDIRECTS: Array<{ from: string; to: string }> = [
  { from: '/coins/:symbol', to: '/app/coins/:symbol' },
  { from: '/lab/backtests/:id', to: '/app/lab/backtests/:id' },
  { from: '/lab/research/runs/:id', to: '/app/lab/research/runs/:id' },
  { from: '/lab/paper/sessions/:id', to: '/app/lab/paper/sessions/:id' },
  { from: '/backtests/:id', to: '/app/lab/backtests/:id' },
  { from: '/research/runs/:id', to: '/app/lab/research/runs/:id' },
  { from: '/paper/sessions/:id', to: '/app/lab/paper/sessions/:id' },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/routes/legacyRedirects.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/routes/legacyRedirects.ts dashboard/src/routes/legacyRedirects.test.ts
git commit -m "feat(routing): add legacy redirect table for the /app split"
```

---

### Task 2: Sidebar links point into /app

**Files:**
- Modify: `dashboard/src/layout/Sidebar.tsx`
- Modify: `dashboard/src/layout/Sidebar.test.tsx`

- [ ] **Step 1: Update the failing test expectations**

Replace the full contents of `dashboard/src/layout/Sidebar.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from './Sidebar'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  it('renders the beginner nav items with correct targets', () => {
    renderAt('/app')
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/app')
    expect(screen.getByRole('link', { name: /markets/i })).toHaveAttribute('href', '/app/markets')
    expect(screen.getByRole('link', { name: /portfolio/i })).toHaveAttribute(
      'href',
      '/app/portfolio',
    )
    expect(screen.getByRole('link', { name: /leaderboard/i })).toHaveAttribute(
      'href',
      '/app/leaderboard',
    )
    expect(screen.getByRole('link', { name: /news/i })).toHaveAttribute('href', '/app/news')
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute(
      'href',
      '/app/settings',
    )
  })

  it('renders the Strategy Lab section with lab links', () => {
    renderAt('/app')
    expect(screen.getByText('Strategy Lab')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /backtests/i })).toHaveAttribute(
      'href',
      '/app/lab/backtests',
    )
    expect(screen.getByRole('link', { name: /research/i })).toHaveAttribute(
      'href',
      '/app/lab/research',
    )
    expect(screen.getByRole('link', { name: /paper sessions/i })).toHaveAttribute(
      'href',
      '/app/lab/paper',
    )
  })

  it('marks the current section active via aria-current', () => {
    renderAt('/app/markets')
    expect(screen.getByRole('link', { name: /markets/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/layout/Sidebar.test.tsx`
Expected: FAIL — hrefs still `/markets`, `/portfolio`, etc. (missing `/app` prefix)

- [ ] **Step 3: Update Sidebar.tsx**

In `dashboard/src/layout/Sidebar.tsx`, replace the `MAIN_ITEMS` and `LAB_ITEMS` arrays and the trailing `SidebarLink` call:

```ts
const MAIN_ITEMS: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/markets', label: 'Markets', icon: CandlestickChart },
  { to: '/app/portfolio', label: 'Portfolio', icon: Wallet },
  { to: '/app/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/app/news', label: 'News', icon: Newspaper },
]

const LAB_ITEMS: NavItem[] = [
  { to: '/app/lab/backtests', label: 'Backtests', icon: FlaskConical },
  { to: '/app/lab/research', label: 'Research', icon: Bot },
  { to: '/app/lab/paper', label: 'Paper Sessions', icon: Activity },
]
```

And at the bottom of the `Sidebar` component:

```tsx
      <div className="mt-auto border-t border-border pt-4">
        <SidebarLink item={{ to: '/app/settings', label: 'Settings', icon: Settings }} />
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/layout/Sidebar.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/layout/Sidebar.tsx dashboard/src/layout/Sidebar.test.tsx
git commit -m "feat(routing): point Sidebar links at /app"
```

---

### Task 3: TopBar links point into /app

**Files:**
- Modify: `dashboard/src/layout/TopBar.tsx`
- Modify: `dashboard/src/layout/TopBar.test.tsx`

- [ ] **Step 1: Update the failing test expectations**

In `dashboard/src/layout/TopBar.test.tsx`, apply these two changes:

1. In `renderBar()`, change the probe route:

```tsx
function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<TopBar />} />
          <Route path="/app/coins/:symbol" element={<><TopBar /><Probe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
```

2. In `renderPersistent()`, change the portfolio route and link target:

```tsx
function renderPersistent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/app']}>
        <TopBar />
        <Routes>
          <Route
            path="/app"
            element={
              <nav>
                <Link to="/app/portfolio">Portfolio</Link>
              </nav>
            }
          />
          <Route path="/app/portfolio" element={<p>portfolio content</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/layout/TopBar.test.tsx`
Expected: FAIL — `shows matches while typing and navigates on selection` fails because `TopBar` still calls `navigate('/coins/BTC')`, which doesn't match the new `/app/coins/:symbol` route.

- [ ] **Step 3: Update TopBar.tsx**

In `dashboard/src/layout/TopBar.tsx`, change the `select` function:

```ts
  const select = (symbol: string) => {
    setQuery('')
    navigate(`/app/coins/${symbol}`)
  }
```

And the portfolio chip link:

```tsx
          <Link
            to="/app/portfolio"
            className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 outline-none transition-colors duration-200 hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:flex"
          >
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/layout/TopBar.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/layout/TopBar.tsx dashboard/src/layout/TopBar.test.tsx
git commit -m "feat(routing): point TopBar links at /app"
```

---

### Task 4: AppShell's lab-scope check matches the new /app/lab prefix

**Files:**
- Modify: `dashboard/src/layout/AppShell.tsx`
- Modify: `dashboard/src/layout/AppShell.test.tsx`

- [ ] **Step 1: Update the failing test expectations**

Replace the full contents of `dashboard/src/layout/AppShell.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  })

  it('renders top bar, sidebar, and routed content', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/app" element={<p>routed content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText('HedgeFund Sim')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument()
    expect(screen.getByText('routed content')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('does not apply legacy-scope on non-lab routes', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/app" element={<p>routed content</p>} />
              <Route path="/app/lab/:section" element={<p>lab content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const content = screen.getByText('routed content')
    expect(content.closest('.legacy-scope')).not.toBeInTheDocument()
  })

  it('applies legacy-scope on /app/lab/* routes', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app/lab/backtests']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/app" element={<p>routed content</p>} />
              <Route path="/app/lab/:section" element={<p>lab content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const content = screen.getByText('lab content')
    expect(content.closest('.legacy-scope')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/layout/AppShell.test.tsx`
Expected: FAIL on `applies legacy-scope on /app/lab/* routes` — the current check `location.pathname.startsWith('/lab/')` doesn't match `/app/lab/backtests`.

- [ ] **Step 3: Update AppShell.tsx**

In `dashboard/src/layout/AppShell.tsx`, replace the `isLabRoute` line:

```ts
  // AppShell is always mounted under /app (see App.tsx), so a single
  // prefix check is enough — no bare /lab route exists to also match.
  const isLabRoute = location.pathname.startsWith('/app/lab')
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/layout/AppShell.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/layout/AppShell.tsx dashboard/src/layout/AppShell.test.tsx
git commit -m "fix(routing): match AppShell legacy-scope against /app/lab prefix"
```

---

### Task 5: Landing page (minimal hero + CTA)

**Files:**
- Create: `dashboard/src/pages/LandingPage.tsx`
- Test: `dashboard/src/pages/LandingPage.test.tsx`

This is the minimum real content for the public `/` route: a headline and a
primary call-to-action into the app, visible without scrolling. FAQ, footer,
sticky mobile CTA, and the response-time note are added on top of this same
file in Phase 3 — this is not a placeholder, it's the real above-the-fold
requirement from the spec, built first because Phase 1 needs *something* real
mounted at `/`.

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/pages/LandingPage.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LandingPage } from './LandingPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  it('renders a headline and a primary CTA into the app, with no interaction required', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start simulating/i })).toHaveAttribute(
      'href',
      '/app',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/pages/LandingPage.test.tsx`
Expected: FAIL — `Cannot find module './LandingPage'`

- [ ] **Step 3: Write the minimal implementation**

```tsx
// dashboard/src/pages/LandingPage.tsx
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Learn to invest without risking a cent
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Trade crypto with $100,000 in virtual cash, real market prices, and
        plain-English AI advice. No real money, ever.
      </p>
      <Button asChild size="lg">
        <Link to="/app">Start simulating — it's free</Link>
      </Button>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/pages/LandingPage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/LandingPage.tsx dashboard/src/pages/LandingPage.test.tsx
git commit -m "feat(landing): add landing page with above-the-fold CTA"
```

---

### Task 6: Custom 404 page with noindex

**Files:**
- Create: `dashboard/src/pages/NotFoundPage.tsx`
- Test: `dashboard/src/pages/NotFoundPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/pages/NotFoundPage.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotFoundPage } from './NotFoundPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  )
}

describe('NotFoundPage', () => {
  it('renders a heading, a link home, and a noindex robots meta tag', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  it('restores the previous robots meta content on unmount', () => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'index, follow'
    document.head.appendChild(meta)

    const { unmount } = renderPage()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')

    unmount()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index, follow',
    )
    meta.remove()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/pages/NotFoundPage.test.tsx`
Expected: FAIL — `Cannot find module './NotFoundPage'`

- [ ] **Step 3: Write the minimal implementation**

```tsx
// dashboard/src/pages/NotFoundPage.tsx
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page not found — HedgeFund Simulator'

    // A soft 404: dashboard/vercel.json rewrites every path to index.html,
    // so Vercel always serves this with HTTP 200 — there's no real 404
    // status to rely on. This meta tag is how we tell crawlers not to
    // index it.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const isNewTag = !meta
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'robots'
      document.head.appendChild(meta)
    }
    const previousContent = meta.content
    meta.content = 'noindex'

    return () => {
      if (isNewTag) {
        meta?.remove()
      } else if (meta) {
        meta.content = previousContent
      }
    }
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Button asChild>
        <Link to="/">Back to home</Link>
      </Button>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/pages/NotFoundPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/NotFoundPage.tsx dashboard/src/pages/NotFoundPage.test.tsx
git commit -m "feat(seo): add custom 404 page with noindex meta tag"
```

---

### Task 7: Wire it all together in App.tsx

**Files:**
- Modify: `dashboard/src/App.tsx`
- Modify: `dashboard/src/App.test.tsx`

**Depends on:** Tasks 1–6 (imports every file created/changed above).

- [ ] **Step 1: Replace App.test.tsx**

```tsx
// dashboard/src/App.test.tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { PARAM_REDIRECTS, STATIC_REDIRECTS } from './routes/legacyRedirects'

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Maps an /app destination to the Sidebar link that should be aria-current
// once a redirect lands there — every STATIC_REDIRECTS/PARAM_REDIRECTS
// target (except /app/coins/:symbol, tested separately) falls under one of
// these eight prefixes.
const NAV_LABEL_FOR_APP_PREFIX: Array<{ prefix: string; label: RegExp }> = [
  { prefix: '/app/lab/backtests', label: /backtests/i },
  { prefix: '/app/lab/research', label: /research/i },
  { prefix: '/app/lab/paper', label: /paper sessions/i },
  { prefix: '/app/markets', label: /markets/i },
  { prefix: '/app/portfolio', label: /portfolio/i },
  { prefix: '/app/leaderboard', label: /leaderboard/i },
  { prefix: '/app/news', label: /news/i },
  { prefix: '/app/settings', label: /settings/i },
]

function navLabelFor(appPath: string): RegExp {
  const match = NAV_LABEL_FOR_APP_PREFIX.find(({ prefix }) => appPath.startsWith(prefix))
  if (!match) throw new Error(`No nav section mapped for ${appPath}`)
  return match.label
}

describe('App routing', () => {
  beforeEach(() => {
    // Lab pages fetch on mount; a never-resolving fetch keeps them in loading state.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  })

  it('renders the landing page at /', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start simulating/i })).toHaveAttribute(
      'href',
      '/app',
    )
  })

  it('renders the Dashboard at /app', () => {
    renderAt('/app')
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('renders the Markets page at /app/markets', () => {
    renderAt('/app/markets')
    expect(screen.getByRole('heading', { name: 'Markets' })).toBeInTheDocument()
  })

  it('renders the trade view at /app/coins/:symbol', () => {
    renderAt('/app/coins/BTC')
    expect(screen.getByText('BTC', { selector: 'p' })).toBeInTheDocument()
  })

  it('renders the Portfolio page at /app/portfolio', () => {
    renderAt('/app/portfolio')
    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument()
  })

  it('renders the 404 page for an unknown path with a noindex meta tag', () => {
    renderAt('/this-page-does-not-exist')
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  describe('legacy redirects into /app', () => {
    it.each(Object.entries(STATIC_REDIRECTS))('redirects %s to %s', async (from, to) => {
      renderAt(from)
      expect(
        await screen.findByRole('link', { name: navLabelFor(to) }),
      ).toHaveAttribute('aria-current', 'page')
    })

    it.each(PARAM_REDIRECTS.filter((r) => r.to !== '/app/coins/:symbol'))(
      'redirects $from to $to',
      async ({ from, to }) => {
        const concretePath = from.replace(/:\w+/, 'test-id')
        renderAt(concretePath)
        expect(
          await screen.findByRole('link', { name: navLabelFor(to) }),
        ).toHaveAttribute('aria-current', 'page')
      },
    )

    it('redirects /coins/:symbol to /app/coins/:symbol', () => {
      renderAt('/coins/BTC')
      expect(screen.getByText('BTC', { selector: 'p' })).toBeInTheDocument()
    })

    it('preserves the query string when redirecting legacy /paper to /app/lab/paper', async () => {
      renderAt('/paper?source_backtest_id=abc-123')
      // PaperStartPage reads source_backtest_id from the URL to prefill the form.
      // If the redirect dropped the query string, this prefill notice would never appear.
      expect(await screen.findByText('From backtest abc-123')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/App.test.tsx`
Expected: FAIL — `App.tsx` still renders the dashboard at `/`, no `/app` routes exist yet.

- [ ] **Step 3: Replace App.tsx**

```tsx
// dashboard/src/App.tsx
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { RedirectWithParams } from './components/RedirectWithParams'
import { LandingPage } from './pages/LandingPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { DashboardPage } from './pages/DashboardPage'
import { MarketsPage } from './pages/MarketsPage'
import { AssetPage } from './pages/AssetPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { NewsPage } from './pages/NewsPage'
import { SettingsPage } from './pages/SettingsPage'
import { NewRunPage } from './pages/NewRunPage'
import { HistoryPage } from './pages/HistoryPage'
import { ResultPage } from './pages/ResultPage'
import { AgentRunPage } from './pages/AgentRunPage'
import { AgentResultPage } from './pages/AgentResultPage'
import { AgentHistoryPage } from './pages/AgentHistoryPage'
import { PaperStartPage } from './pages/PaperStartPage'
import { PaperHistoryPage } from './pages/PaperHistoryPage'
import { PaperLivePage } from './pages/PaperLivePage'
import { PARAM_REDIRECTS, STATIC_REDIRECTS } from './routes/legacyRedirects'

export default function App() {
  const location = useLocation()
  return (
    <Routes>
      {/* Public marketing surface — no AppShell */}
      <Route path="/" element={<LandingPage />} />

      <Route element={<AppShell />}>
        {/* Beginner surfaces */}
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/markets" element={<MarketsPage />} />
        <Route path="/app/coins/:symbol" element={<AssetPage />} />
        <Route path="/app/portfolio" element={<PortfolioPage />} />
        <Route path="/app/leaderboard" element={<LeaderboardPage />} />
        <Route path="/app/news" element={<NewsPage />} />
        <Route path="/app/settings" element={<SettingsPage />} />

        {/* Strategy Lab — existing pages */}
        <Route path="/app/lab/backtests" element={<NewRunPage />} />
        <Route path="/app/lab/backtests/history" element={<HistoryPage />} />
        <Route path="/app/lab/backtests/:id" element={<ResultPage />} />
        <Route path="/app/lab/research" element={<AgentRunPage />} />
        <Route path="/app/lab/research/history" element={<AgentHistoryPage />} />
        <Route path="/app/lab/research/runs/:id" element={<AgentResultPage />} />
        <Route path="/app/lab/paper" element={<PaperStartPage />} />
        <Route path="/app/lab/paper/history" element={<PaperHistoryPage />} />
        <Route path="/app/lab/paper/sessions/:id" element={<PaperLivePage />} />
      </Route>

      {/* Legacy redirects — every bookmark that worked before this /app
          split (or before the older Strategy Lab rename) keeps working. */}
      {Object.entries(STATIC_REDIRECTS).map(([from, to]) => (
        <Route key={from} path={from} element={<Navigate to={to} replace />} />
      ))}
      {PARAM_REDIRECTS.map(({ from, to }) => (
        <Route key={from} path={from} element={<RedirectWithParams to={to} />} />
      ))}
      <Route
        path="/paper"
        element={
          <Navigate to={{ pathname: '/app/lab/paper', search: location.search }} replace />
        }
      />

      {/* Unmatched path */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/App.test.tsx`
Expected: PASS (all tests, including the parametrized redirect cases)

- [ ] **Step 5: Run the full frontend suite**

Run: `cd dashboard && npm test`
Expected: PASS — this touches shared layout components, so run everything once to catch any other test that hardcoded an old bare path.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/App.tsx dashboard/src/App.test.tsx
git commit -m "feat(routing): split app into public landing page (/) and /app dashboard"
```

---

### Task 8: robots.txt and sitemap.xml

**Files:**
- Create: `dashboard/public/robots.txt`
- Create: `dashboard/public/sitemap.xml`

Vite copies everything in `dashboard/public/` verbatim into the build output
root, and Vercel serves an existing static file before applying the SPA
rewrite in `vercel.json` — so these are served as real static files, not
routed through React.

- [ ] **Step 1: Create robots.txt**

```
User-agent: *
Allow: /
Disallow: /app

Sitemap: https://crypto-quant-lab.vercel.app/sitemap.xml
```

`/app` is disallowed because it's a shared live demo portfolio with no
per-visitor content — not useful to index, and keeps crawl budget on the
real marketing content at `/`.

- [ ] **Step 2: Create sitemap.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://crypto-quant-lab.vercel.app/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

`/privacy` is added here in Phase 5 once that page exists. `/app` and
`/thank-you` are deliberately never listed (shared demo state and a
post-action confirmation page, respectively — neither is a content
destination worth indexing).

- [ ] **Step 3: Verify locally**

Run: `cd dashboard && npm run build && npm run preview`
Then open `http://localhost:4173/robots.txt` and `http://localhost:4173/sitemap.xml` in a
browser and confirm both serve as plain text/XML (not the SPA's `index.html`).
Stop the preview server (Ctrl+C) once confirmed.

- [ ] **Step 4: Commit**

```bash
git add dashboard/public/robots.txt dashboard/public/sitemap.xml
git commit -m "feat(seo): add robots.txt and sitemap.xml"
```

---

### Task 9: Fix stale in-page links across the whole component tree

**Files:**
- Modify: `dashboard/src/pages/DashboardPage.tsx`
- Modify: `dashboard/src/pages/AssetPage.tsx`
- Modify: `dashboard/src/pages/AssetPage.test.tsx`
- Modify: `dashboard/src/pages/PortfolioPage.tsx`
- Modify: `dashboard/src/pages/PortfolioPage.test.tsx`
- Modify: `dashboard/src/pages/ResultPage.tsx`
- Modify: `dashboard/src/pages/AgentResultPage.tsx`
- Modify: `dashboard/src/components/AssetRow.tsx`
- Modify: `dashboard/src/components/AssetRow.test.tsx`
- Modify: `dashboard/src/components/MarketCard.tsx`
- Modify: `dashboard/src/components/MarketCard.test.tsx`
- Modify: `dashboard/src/pages/MarketsPage.test.tsx`
- Modify: `dashboard/src/components/PositionsTable.tsx`
- Modify: `dashboard/src/components/AgentRunCard.tsx`
- Modify: `dashboard/src/components/IterationCard.tsx`
- Modify: `dashboard/src/components/RunCard.tsx`
- Modify: `dashboard/src/components/PaperSessionCard.tsx`

A repo-wide audit (`grep` for `to="/...`, `` to={`/...` ``, and
`` href={`/...` `` across `dashboard/src`) found that Tasks 2–3 only fixed
navigation chrome (`Sidebar`/`TopBar`) — every page-level and card-level
internal link elsewhere in the app still points at a pre-split path. The
`STATIC_REDIRECTS`/`PARAM_REDIRECTS` tables from Task 1 mean all of these
still technically resolve (one extra client-side redirect hop), except
`AgentResultPage.tsx`'s link, which is a plain `<a href>` rather than a
router `Link` — clicking it triggers a full page reload, not a client-side
transition. Fix all of it at the source now, while this plan is still
unexecuted:

| File : line | Current | Fix |
|---|---|---|
| `DashboardPage.tsx:117` | `to="/markets"` | `to="/app/markets"` |
| `DashboardPage.tsx:127` | `` to={`/coins/${p.symbol}`} `` | `` to={`/app/coins/${p.symbol}`} `` |
| `DashboardPage.tsx:163` | `` to={`/coins/${asset.symbol}`} `` | `` to={`/app/coins/${asset.symbol}`} `` |
| `AssetPage.tsx:76` | `to="/markets"` | `to="/app/markets"` |
| `PortfolioPage.tsx:50` | `to="/markets"` | `to="/app/markets"` |
| `AssetRow.tsx:19` | `` to={`/coins/${asset.symbol}`} `` | `` to={`/app/coins/${asset.symbol}`} `` |
| `MarketCard.tsx:12` | `` to={`/coins/${asset.symbol}`} `` | `` to={`/app/coins/${asset.symbol}`} `` |
| `PositionsTable.tsx:63` | `` to={`/coins/${p.symbol}`} `` | `` to={`/app/coins/${p.symbol}`} `` |
| `ResultPage.tsx:31` | `` to={`/paper?source_backtest_id=${id}`} `` | `` to={`/app/lab/paper?source_backtest_id=${id}`} `` |
| `AgentRunCard.tsx:10` | `` to={`/research/runs/${run.id}`} `` | `` to={`/app/lab/research/runs/${run.id}`} `` |
| `IterationCard.tsx:17` | `` to={`/backtests/${backtest_id}`} `` | `` to={`/app/lab/backtests/${backtest_id}`} `` |
| `RunCard.tsx:16` | `` to={`/backtests/${summary.id}`} `` | `` to={`/app/lab/backtests/${summary.id}`} `` |
| `PaperSessionCard.tsx:8` | `` to={`/paper/sessions/${session.id}`} `` | `` to={`/app/lab/paper/sessions/${session.id}`} `` |
| `AgentResultPage.tsx:47` | `` <a href={`/backtests/${runDone.winner_backtest_id}`}>view result →</a> `` | `` <Link to={`/app/lab/backtests/${runDone.winner_backtest_id}`}>view result →</Link> `` (also swap the plain `<a>` for a router `Link` — add `import { Link } from 'react-router-dom'` at the top of the file, alongside the existing `useParams` import) |

- [ ] **Step 1: Update the three failing test expectations**

In `dashboard/src/pages/AssetPage.test.tsx`, change the `'/markets'` href
assertion to `'/app/markets'`:

```tsx
    expect(screen.getByRole('link', { name: /back to markets/i })).toHaveAttribute(
      'href',
      '/app/markets',
    )
```

In `dashboard/src/pages/PortfolioPage.test.tsx`, change the `'/markets'`
href assertion to `'/app/markets'`:

```tsx
    expect(screen.getByRole('link', { name: /explore markets/i })).toHaveAttribute(
      'href', '/app/markets',
    )
```

In `dashboard/src/components/AssetRow.test.tsx`, change:

```tsx
    expect(screen.getByRole('link')).toHaveAttribute('href', '/coins/BTC')
```

to:

```tsx
    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/coins/BTC')
```

In `dashboard/src/components/MarketCard.test.tsx`, change:

```tsx
    expect(screen.getByRole('link')).toHaveAttribute('href', '/coins/BTC')
```

to:

```tsx
    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/coins/BTC')
```

In `dashboard/src/pages/MarketsPage.test.tsx`, change:

```tsx
    expect(links[0]).toHaveAttribute('href', '/coins/SOL')
```

to:

```tsx
    expect(links[0]).toHaveAttribute('href', '/app/coins/SOL')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard && npm test -- src/pages/AssetPage.test.tsx src/pages/PortfolioPage.test.tsx src/components/AssetRow.test.tsx src/components/MarketCard.test.tsx src/pages/MarketsPage.test.tsx`
Expected: FAIL — all five still assert/render the pre-`/app` paths

- [ ] **Step 3: Apply every fix from the table above**

Edit each of the thirteen source files listed in the table, changing only
the specific `to`/`href` value shown — no other logic changes. For
`AgentResultPage.tsx`, also add the `Link` import and change the element
from `<a href=...>` to `<Link to=...>` as noted in the table.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd dashboard && npm test`
Expected: PASS — full suite, since this touches enough files that a scoped
run risks missing a knock-on failure (e.g. `DashboardPage.test.tsx`,
`PositionsTable.test.tsx`, `AgentRunCard.test.tsx`, `IterationCard.test.tsx`,
`RunCard.test.tsx`, `PaperSessionCard.test.tsx`, `ResultPage.test.tsx`,
`AgentResultPage.test.tsx` didn't have an href assertion on these specific
links as of this audit, so they were already green — this run confirms none
of them silently relied on the old path some other way).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/DashboardPage.tsx dashboard/src/pages/AssetPage.tsx \
  dashboard/src/pages/AssetPage.test.tsx dashboard/src/pages/PortfolioPage.tsx \
  dashboard/src/pages/PortfolioPage.test.tsx dashboard/src/pages/ResultPage.tsx \
  dashboard/src/pages/AgentResultPage.tsx dashboard/src/components/AssetRow.tsx \
  dashboard/src/components/AssetRow.test.tsx dashboard/src/components/MarketCard.tsx \
  dashboard/src/components/MarketCard.test.tsx dashboard/src/pages/MarketsPage.test.tsx \
  dashboard/src/components/PositionsTable.tsx dashboard/src/components/AgentRunCard.tsx \
  dashboard/src/components/IterationCard.tsx dashboard/src/components/RunCard.tsx \
  dashboard/src/components/PaperSessionCard.tsx
git commit -m "fix(routing): point every in-page link at its /app path, and fix a plain <a> that skipped client-side routing"
```

---

## Phase 1 exit check

After Task 8, run both full suites once more before moving to Phase 2:

```bash
cd dashboard && npm run build && npm test
```

Manually smoke-test in the dev server (`npm run dev`): visit `/`, click the
CTA into `/app`, confirm the dashboard and Sidebar/TopBar navigation all work
under `/app/*`, visit an old bookmark like `/markets` and confirm it lands on
`/app/markets` with **Markets** highlighted in the sidebar, and visit a
nonsense path to confirm the 404 page renders.
