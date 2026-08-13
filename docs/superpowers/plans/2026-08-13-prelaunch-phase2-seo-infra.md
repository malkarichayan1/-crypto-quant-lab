# Pre-Launch Phase 2: SEO Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every route gets a unique `<title>`/meta description, `index.html` carries canonical/OG/Twitter tags plus a real social share image, and the codebase is confirmed clean of un-alt-texted images.

**Architecture:** A single route-keyed metadata table (`pageMeta.ts`) plus one `PageMetaSync` component mounted once inside `AppShell` drives per-route titles/descriptions for all `/app/*` pages — cheaper and more DRY than editing all sixteen page files individually. `LandingPage` and `NotFoundPage` call the same underlying `usePageMeta` hook directly, since they render outside `AppShell`. Static OG/canonical/Twitter tags go straight into `index.html` since they don't vary per client-side route (this app has no server-rendered per-route HTML for crawlers to see anyway).

**Tech Stack:** React 18, react-router-dom v6 (`matchPath`), Vitest. No new dependencies.

Reference spec: `docs/superpowers/specs/2026-08-13-pre-launch-seo-marketing-design.md`, section 8.

**Depends on:** Phase 1 (imports `LandingPage`, `NotFoundPage`, `AppShell` as they exist after that plan).

---

### Task 1: usePageMeta hook

**Files:**
- Create: `dashboard/src/hooks/usePageMeta.ts`
- Test: `dashboard/src/hooks/usePageMeta.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/hooks/usePageMeta.test.tsx
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePageMeta } from './usePageMeta'

function getDescription(): string | null {
  return document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null
}

describe('usePageMeta', () => {
  it('sets document.title and the description meta tag', () => {
    renderHook(() => usePageMeta('Test Title', 'Test description.'))
    expect(document.title).toBe('Test Title')
    expect(getDescription()).toBe('Test description.')
  })

  it('updates both when the arguments change', () => {
    const { rerender } = renderHook(({ title, desc }) => usePageMeta(title, desc), {
      initialProps: { title: 'First', desc: 'First desc.' },
    })
    rerender({ title: 'Second', desc: 'Second desc.' })
    expect(document.title).toBe('Second')
    expect(getDescription()).toBe('Second desc.')
  })

  it('restores the previous title and description on unmount', () => {
    document.title = 'Original Title'
    const meta = document.createElement('meta')
    meta.name = 'description'
    meta.content = 'Original description.'
    document.head.appendChild(meta)

    const { unmount } = renderHook(() => usePageMeta('Test Title', 'Test description.'))
    expect(document.title).toBe('Test Title')

    unmount()
    expect(document.title).toBe('Original Title')
    expect(getDescription()).toBe('Original description.')
    meta.remove()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/hooks/usePageMeta.test.tsx`
Expected: FAIL — `Cannot find module './usePageMeta'`

- [ ] **Step 3: Write the implementation**

```ts
// dashboard/src/hooks/usePageMeta.ts
import { useEffect } from 'react'

/**
 * Sets document.title and the <meta name="description"> tag for as long as
 * the calling component is mounted, restoring the previous values on
 * unmount. This app is a client-only SPA with no SSR to coordinate with, so
 * a direct DOM hook is simpler than pulling in react-helmet-async.
 */
export function usePageMeta(title: string, description: string): void {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const isNewTag = !meta
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    const previousDescription = meta.content
    meta.content = description

    return () => {
      document.title = previousTitle
      if (isNewTag) {
        meta?.remove()
      } else if (meta) {
        meta.content = previousDescription
      }
    }
  }, [title, description])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/hooks/usePageMeta.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/hooks/usePageMeta.ts dashboard/src/hooks/usePageMeta.test.tsx
git commit -m "feat(seo): add usePageMeta hook for per-route title/description"
```

---

### Task 2: Route-keyed metadata table + PageMetaSync

**Files:**
- Create: `dashboard/src/routes/pageMeta.ts`
- Test: `dashboard/src/routes/pageMeta.test.ts`
- Create: `dashboard/src/components/PageMetaSync.tsx`
- Test: `dashboard/src/components/PageMetaSync.test.tsx`
- Modify: `dashboard/src/layout/AppShell.tsx`

- [ ] **Step 1: Write the failing test for the metadata table**

```ts
// dashboard/src/routes/pageMeta.test.ts
import { describe, expect, it } from 'vitest'
import { APP_PAGE_META } from './pageMeta'

describe('APP_PAGE_META', () => {
  it('has a non-empty title and description for every entry', () => {
    for (const entry of APP_PAGE_META) {
      expect(entry.title.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate patterns', () => {
    const patterns = APP_PAGE_META.map((e) => e.pattern)
    expect(new Set(patterns).size).toBe(patterns.length)
  })

  it('covers every real /app route from App.tsx', () => {
    const expected = [
      '/app',
      '/app/markets',
      '/app/coins/:symbol',
      '/app/portfolio',
      '/app/leaderboard',
      '/app/news',
      '/app/settings',
      '/app/lab/backtests',
      '/app/lab/backtests/history',
      '/app/lab/backtests/:id',
      '/app/lab/research',
      '/app/lab/research/history',
      '/app/lab/research/runs/:id',
      '/app/lab/paper',
      '/app/lab/paper/history',
      '/app/lab/paper/sessions/:id',
    ]
    const patterns = APP_PAGE_META.map((e) => e.pattern)
    for (const route of expected) {
      expect(patterns).toContain(route)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/routes/pageMeta.test.ts`
Expected: FAIL — `Cannot find module './pageMeta'`

- [ ] **Step 3: Write the metadata table**

```ts
// dashboard/src/routes/pageMeta.ts
export type PageMetaEntry = { pattern: string; title: string; description: string }

/**
 * One entry per real /app/* route (see App.tsx). `pattern` is a
 * react-router-dom path pattern, matched via matchPath in PageMetaSync.
 */
export const APP_PAGE_META: PageMetaEntry[] = [
  {
    pattern: '/app',
    title: 'Dashboard — HedgeFund Simulator',
    description:
      "Your simulated portfolio at a glance: value, today's P/L, total return, and buying power.",
  },
  {
    pattern: '/app/markets',
    title: 'Markets — HedgeFund Simulator',
    description: 'Browse live crypto prices and star your favorite coins to watch.',
  },
  {
    pattern: '/app/coins/:symbol',
    title: 'Trade — HedgeFund Simulator',
    description: 'View price history and place simulated buy/sell orders for a coin.',
  },
  {
    pattern: '/app/portfolio',
    title: 'Portfolio — HedgeFund Simulator',
    description: 'Your simulated positions, order history, and performance over time.',
  },
  {
    pattern: '/app/leaderboard',
    title: 'Leaderboard — HedgeFund Simulator',
    description: 'See how your simulated portfolio stacks up against the AI and buy-and-hold.',
  },
  {
    pattern: '/app/news',
    title: 'News — HedgeFund Simulator',
    description: 'Recent crypto market news, fetched and cached for you.',
  },
  {
    pattern: '/app/settings',
    title: 'Settings — HedgeFund Simulator',
    description: 'Manage your AI advisor preference and reset your simulated portfolio.',
  },
  {
    pattern: '/app/lab/backtests',
    title: 'New Backtest — Strategy Lab',
    description: 'Configure and run a rule-based trading strategy backtest.',
  },
  {
    pattern: '/app/lab/backtests/history',
    title: 'Backtest History — Strategy Lab',
    description: 'Browse your past strategy backtests.',
  },
  {
    pattern: '/app/lab/backtests/:id',
    title: 'Backtest Result — Strategy Lab',
    description: 'Detailed results, equity curve, and trade log for a backtest run.',
  },
  {
    pattern: '/app/lab/research',
    title: 'AI Research — Strategy Lab',
    description: 'Ask an AI research agent to iterate on a trading strategy.',
  },
  {
    pattern: '/app/lab/research/history',
    title: 'Research History — Strategy Lab',
    description: 'Browse your past AI research runs.',
  },
  {
    pattern: '/app/lab/research/runs/:id',
    title: 'Research Run — Strategy Lab',
    description: 'Iteration-by-iteration detail for an AI research run.',
  },
  {
    pattern: '/app/lab/paper',
    title: 'Paper Trading — Strategy Lab',
    description: 'Start a live simulated paper-trading session for a strategy.',
  },
  {
    pattern: '/app/lab/paper/history',
    title: 'Paper Session History — Strategy Lab',
    description: 'Browse your past paper-trading sessions.',
  },
  {
    pattern: '/app/lab/paper/sessions/:id',
    title: 'Paper Session — Strategy Lab',
    description: 'Live holdings, trade feed, and equity for a paper-trading session.',
  },
]

export const FALLBACK_PAGE_META: PageMetaEntry = {
  pattern: '*',
  title: 'HedgeFund Simulator',
  description: 'A free crypto paper-trading simulator for beginners.',
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/routes/pageMeta.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for PageMetaSync**

```tsx
// dashboard/src/components/PageMetaSync.test.tsx
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PageMetaSync } from './PageMetaSync'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<PageMetaSync />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PageMetaSync', () => {
  it('sets the Dashboard title at /app', () => {
    renderAt('/app')
    expect(document.title).toBe('Dashboard — HedgeFund Simulator')
  })

  it('sets the Trade title for a dynamic /app/coins/:symbol path', () => {
    renderAt('/app/coins/BTC')
    expect(document.title).toBe('Trade — HedgeFund Simulator')
  })

  it('falls back to the generic title for an unmapped path', () => {
    renderAt('/app/something-unmapped')
    expect(document.title).toBe('HedgeFund Simulator')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/components/PageMetaSync.test.tsx`
Expected: FAIL — `Cannot find module './PageMetaSync'`

- [ ] **Step 7: Write the implementation**

```tsx
// dashboard/src/components/PageMetaSync.tsx
import { matchPath, useLocation } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { APP_PAGE_META, FALLBACK_PAGE_META } from '../routes/pageMeta'

/**
 * Mounted once inside AppShell. Looks up the current route in
 * APP_PAGE_META and syncs document.title / meta description via
 * usePageMeta — one place to keep every /app/* page's SEO metadata
 * correct, instead of a hook call duplicated across sixteen page files.
 */
export function PageMetaSync() {
  const location = useLocation()
  const entry =
    APP_PAGE_META.find((candidate) => matchPath(candidate.pattern, location.pathname)) ??
    FALLBACK_PAGE_META
  usePageMeta(entry.title, entry.description)
  return null
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/components/PageMetaSync.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 9: Mount PageMetaSync inside AppShell**

In `dashboard/src/layout/AppShell.tsx`, add the import and mount it as a sibling of `<Toaster>`:

```tsx
import { Outlet, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { cn } from '@/lib/utils'
import { PageMetaSync } from '../components/PageMetaSync'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppShell() {
  const location = useLocation()
  const isLabRoute = location.pathname.startsWith('/app/lab')

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PageMetaSync />
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden p-6">
          <div className={cn('mx-auto w-full max-w-6xl', isLabRoute && 'legacy-scope')}>
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  )
}
```

- [ ] **Step 10: Run the AppShell test to confirm no regression**

Run: `cd dashboard && npm test -- src/layout/AppShell.test.tsx`
Expected: PASS (3 tests — `PageMetaSync` renders `null`, doesn't change existing assertions)

- [ ] **Step 11: Commit**

```bash
git add dashboard/src/routes/pageMeta.ts dashboard/src/routes/pageMeta.test.ts \
  dashboard/src/components/PageMetaSync.tsx dashboard/src/components/PageMetaSync.test.tsx \
  dashboard/src/layout/AppShell.tsx
git commit -m "feat(seo): add per-route title/description via PageMetaSync"
```

---

### Task 3: Apply usePageMeta to LandingPage and NotFoundPage

**Files:**
- Modify: `dashboard/src/pages/LandingPage.tsx`
- Modify: `dashboard/src/pages/LandingPage.test.tsx`
- Modify: `dashboard/src/pages/NotFoundPage.tsx`
- Modify: `dashboard/src/pages/NotFoundPage.test.tsx`

These two pages render outside `AppShell`, so they call `usePageMeta`
directly instead of going through `PageMetaSync`.

- [ ] **Step 1: Extend LandingPage.test.tsx**

Add this test to the existing `describe('LandingPage', ...)` block:

```tsx
  it('sets a unique title and description', () => {
    renderPage()
    expect(document.title).toBe('HedgeFund Simulator — Practice investing risk-free')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      'Trade crypto with $100,000 in virtual cash, real market prices, and free AI advice. No real money, ever.',
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/pages/LandingPage.test.tsx`
Expected: FAIL — title/description not set yet

- [ ] **Step 3: Update LandingPage.tsx**

```tsx
// dashboard/src/pages/LandingPage.tsx
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../hooks/usePageMeta'

export function LandingPage() {
  usePageMeta(
    'HedgeFund Simulator — Practice investing risk-free',
    'Trade crypto with $100,000 in virtual cash, real market prices, and free AI advice. No real money, ever.',
  )

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
Expected: PASS (2 tests)

- [ ] **Step 5: Extend NotFoundPage.test.tsx**

Add to the existing `describe('NotFoundPage', ...)` block:

```tsx
  it('sets a distinct title and description', () => {
    renderPage()
    expect(document.title).toBe('Page not found — HedgeFund Simulator')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      "The page you're looking for doesn't exist or may have moved.",
    )
  })
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/pages/NotFoundPage.test.tsx`
Expected: FAIL — description meta not set (title happens to already match from the old inline logic, but the description assertion fails)

- [ ] **Step 7: Update NotFoundPage.tsx to use the shared hook for title/description**

```tsx
// dashboard/src/pages/NotFoundPage.tsx
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../hooks/usePageMeta'

export function NotFoundPage() {
  usePageMeta(
    'Page not found — HedgeFund Simulator',
    "The page you're looking for doesn't exist or may have moved.",
  )

  useEffect(() => {
    // A soft 404: dashboard/vercel.json rewrites every path to index.html,
    // so Vercel always serves this with HTTP 200 — there's no real 404
    // status to rely on. This meta tag is how we tell crawlers not to
    // index it. Kept separate from usePageMeta, which only owns
    // title/description.
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

- [ ] **Step 8: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/pages/NotFoundPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add dashboard/src/pages/LandingPage.tsx dashboard/src/pages/LandingPage.test.tsx \
  dashboard/src/pages/NotFoundPage.tsx dashboard/src/pages/NotFoundPage.test.tsx
git commit -m "feat(seo): apply usePageMeta to LandingPage and NotFoundPage"
```

---

### Task 4: Canonical + OG/Twitter tags in index.html

**Files:**
- Modify: `dashboard/index.html`

- [ ] **Step 1: Replace index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HedgeFund Simulator — Practice investing risk-free</title>
    <meta
      name="description"
      content="Trade crypto with $100,000 in virtual cash, real market prices, and free AI advice. No real money, ever."
    />
    <link rel="canonical" href="https://crypto-quant-lab.vercel.app/" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="HedgeFund Simulator" />
    <meta property="og:title" content="HedgeFund Simulator — Practice investing risk-free" />
    <meta
      property="og:description"
      content="Trade crypto with $100,000 in virtual cash, real market prices, and free AI advice. No real money, ever."
    />
    <meta property="og:url" content="https://crypto-quant-lab.vercel.app/" />
    <meta property="og:image" content="https://crypto-quant-lab.vercel.app/og-image.png" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="HedgeFund Simulator — Practice investing risk-free" />
    <meta
      name="twitter:description"
      content="Trade crypto with $100,000 in virtual cash, real market prices, and free AI advice. No real money, ever."
    />
    <meta name="twitter:image" content="https://crypto-quant-lab.vercel.app/og-image.png" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

These are static defaults for the document crawlers/link-unfurlers see
before JS runs; `usePageMeta`/`PageMetaSync` override `<title>` and the
description tag per client-side route once JS executes. The `og:image` and
`twitter:image` URLs point at the file created in Task 5.

- [ ] **Step 2: Verify the build still succeeds**

Run: `cd dashboard && npm run build`
Expected: builds cleanly (this is a static markup change, no TS/JS involved)

- [ ] **Step 3: Commit**

```bash
git add dashboard/index.html
git commit -m "feat(seo): add canonical, OG, and Twitter card tags to index.html"
```

---

### Task 5: Social share image

**Files:**
- Create: `dashboard/scratch/og-template.html` (temporary, deleted at the end of this task)
- Create: `dashboard/public/og-image.png`

No logo or brand asset exists in this repo. The image is built from the
app's real dark-theme tokens (`dashboard/src/styles/app.css`:
`--background: #0f1117`, `--primary: #3b82f6`, `--foreground: #f2f4f8`), not
a generic template — rendered via a headless-browser screenshot of a
purpose-built HTML file, at the standard 1200×630 OG size.

- [ ] **Step 1: Write the template**

```html
<!-- dashboard/scratch/og-template.html -->
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body {
        margin: 0;
        width: 1200px;
        height: 630px;
        background: #0f1117;
        color: #f2f4f8;
        font-family: -apple-system, 'Segoe UI', sans-serif;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        padding: 0 100px;
        box-sizing: border-box;
      }
      .brand {
        color: #3b82f6;
        font-size: 28px;
        font-weight: 700;
        letter-spacing: 0.02em;
        margin-bottom: 32px;
      }
      h1 {
        font-size: 64px;
        font-weight: 800;
        line-height: 1.1;
        margin: 0 0 24px 0;
        max-width: 900px;
      }
      p {
        font-size: 28px;
        color: #8b93a7;
        margin: 0;
        max-width: 820px;
      }
    </style>
  </head>
  <body>
    <div class="brand">HEDGEFUND SIMULATOR</div>
    <h1>Learn to invest without risking a cent</h1>
    <p>$100,000 in virtual cash · real market prices · free AI advice</p>
  </body>
</html>
```

- [ ] **Step 2: Render and capture the image**

Using the `mcp__plugin_ecc_chrome-devtools` tools:

1. `new_page` with `url` set to the absolute local file path of
   `dashboard/scratch/og-template.html` (e.g.
   `file:///c:/Users/malka/OneDrive/CS%20Projects/HedgeFund%20Simulator/dashboard/scratch/og-template.html`).
2. `resize_page` to width `1200`, height `630`.
3. `take_screenshot` with format `png`, no `fullPage` (viewport is already
   exactly 1200×630), saving to `dashboard/public/og-image.png`.
4. `close_page`.

If the screenshot tool returns image bytes rather than writing directly to
disk, save the returned PNG to `dashboard/public/og-image.png` using the
Write tool.

- [ ] **Step 3: Verify the image**

Run: `cd dashboard && node -e "const s=require('fs').statSync('public/og-image.png'); console.log(s.size)"`
Expected: prints a non-zero byte size (a real PNG, not an empty file)

Open `dashboard/public/og-image.png` and visually confirm: dark background,
readable headline, matches the app's palette.

- [ ] **Step 4: Remove the scratch template**

```bash
rm -rf dashboard/scratch
```

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/og-image.png
git commit -m "feat(seo): add social share image"
```

---

### Task 6: Alt-text audit + regression guard

**Files:**
- Create: `dashboard/src/imageAccessibility.test.ts`

A repo-wide search during spec brainstorming found **zero** `<img>` elements
anywhere in `dashboard/src` — all visuals are CSS/SVG (`lucide-react` icons,
`CoinIcon`'s colored `<div>`), and the one purely-decorative element that
looks image-like (`CoinIcon`) already carries `aria-hidden="true"`. There is
no existing violation to fix. This task adds a regression guard so a future
`<img>` without `alt` doesn't slip in silently.

- [ ] **Step 1: Write the guard test**

```ts
// dashboard/src/imageAccessibility.test.ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_DIR = join(__dirname)

function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(full))
    } else if (/\.(tsx|jsx)$/.test(name) && !name.endsWith('.test.tsx')) {
      files.push(full)
    }
  }
  return files
}

describe('image accessibility', () => {
  it('every <img> tag in source has an alt attribute (empty alt is fine for decorative images)', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(SRC_DIR)) {
      const content = readFileSync(file, 'utf-8')
      const imgTags = content.match(/<img\b[^>]*>/g) ?? []
      for (const tag of imgTags) {
        if (!/\balt\s*=/.test(tag)) {
          offenders.push(`${file}: ${tag}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it passes immediately**

Run: `cd dashboard && npm test -- src/imageAccessibility.test.ts`
Expected: PASS (0 offenders — confirms the audit finding above; this is a
guard test, not a fix, so there's no red-then-green cycle here)

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/imageAccessibility.test.ts
git commit -m "test(a11y): guard against future <img> tags missing alt text"
```

---

## Phase 2 exit check

```bash
cd dashboard && npm run build && npm test
```

Manually verify in the dev server: view page source / DevTools on `/` and a
couple of `/app/*` routes and confirm `document.title` changes per route,
and paste `https://crypto-quant-lab.vercel.app/` into a social-card debugger
(e.g. Facebook Sharing Debugger or Twitter Card Validator) once deployed to
confirm the OG image renders.
