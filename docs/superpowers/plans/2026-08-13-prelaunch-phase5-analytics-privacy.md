# Pre-Launch Phase 5: Analytics, Consent & Privacy Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GA4 loads only after a visitor accepts a cookie-consent banner, tracks page views manually on every client-side route change, and a `/privacy` page describes — accurately, based on what the codebase actually does — what little data this app collects.

**Architecture:** A `useCookieConsent`/`setCookieConsent` pair (same `useSyncExternalStore` + `localStorage` pattern as the existing `useAdvisorEnabled`) drives a `CookieConsentBanner`. A separate `loadGtag` utility injects the `gtag.js` script exactly once; `useGoogleAnalytics` (mounted once in `App.tsx`, which already has router context) reads consent + the env var on every render and fires a manual `page_view` on route change, since GA4 doesn't auto-track SPA navigation. `PrivacyPolicyPage` is static content, no new mechanism.

**Tech Stack:** React 18, react-router-dom, Vitest (`vi.stubEnv`). No new npm dependencies — `gtag.js` is loaded at runtime via a plain `<script>` tag, not an SDK package.

Reference spec: `docs/superpowers/specs/2026-08-13-pre-launch-seo-marketing-design.md`, sections 9–10.

**Depends on:** Phase 1 (`App.tsx`, `LandingPage.tsx`) and Phase 2 (`usePageMeta`). Independent of Phases 3–4.

---

### Task 1: Cookie consent state

**Files:**
- Create: `dashboard/src/hooks/useCookieConsent.ts`
- Test: `dashboard/src/hooks/useCookieConsent.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/hooks/useCookieConsent.test.tsx
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { setCookieConsent, useCookieConsent } from './useCookieConsent'

describe('useCookieConsent', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('returns null when no choice has been made', () => {
    const { result } = renderHook(() => useCookieConsent())
    expect(result.current).toBeNull()
  })

  it('reflects the stored choice after setCookieConsent("accepted")', () => {
    const { result } = renderHook(() => useCookieConsent())
    act(() => setCookieConsent('accepted'))
    expect(result.current).toBe('accepted')
  })

  it('reflects the stored choice after setCookieConsent("declined")', () => {
    const { result } = renderHook(() => useCookieConsent())
    act(() => setCookieConsent('declined'))
    expect(result.current).toBe('declined')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/hooks/useCookieConsent.test.tsx`
Expected: FAIL — `Cannot find module './useCookieConsent'`

- [ ] **Step 3: Write the implementation**

```ts
// dashboard/src/hooks/useCookieConsent.ts
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'hedgefund.cookieConsent'
export type ConsentChoice = 'accepted' | 'declined'

// Same pattern as useAdvisorEnabled: localStorage doesn't fire a 'storage'
// event in the tab that wrote it, so a module-level subscriber set nudges
// components in this tab; the window listener covers other tabs.
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function getSnapshot(): ConsentChoice | null {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw === 'accepted' || raw === 'declined' ? raw : null
}

export function setCookieConsent(choice: ConsentChoice): void {
  window.localStorage.setItem(STORAGE_KEY, choice)
  listeners.forEach((listener) => listener())
}

/** null means "no choice made yet" — the banner should show. */
export function useCookieConsent(): ConsentChoice | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/hooks/useCookieConsent.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/hooks/useCookieConsent.ts dashboard/src/hooks/useCookieConsent.test.tsx
git commit -m "feat(privacy): add useCookieConsent hook"
```

---

### Task 2: Cookie consent banner

**Files:**
- Create: `dashboard/src/components/CookieConsentBanner.tsx`
- Test: `dashboard/src/components/CookieConsentBanner.test.tsx`

**Depends on:** Task 1.

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/components/CookieConsentBanner.test.tsx
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { CookieConsentBanner } from './CookieConsentBanner'
import { setCookieConsent } from '../hooks/useCookieConsent'

function renderBanner() {
  return render(
    <MemoryRouter>
      <CookieConsentBanner />
    </MemoryRouter>,
  )
}

describe('CookieConsentBanner', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('shows Accept/Decline and a link to the Privacy Policy when no choice has been made', () => {
    renderBanner()
    expect(screen.getByRole('button', { name: /^accept$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^decline$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('hides itself once Accept is clicked', async () => {
    const user = userEvent.setup()
    renderBanner()
    await user.click(screen.getByRole('button', { name: /^accept$/i }))
    expect(screen.queryByRole('button', { name: /^accept$/i })).not.toBeInTheDocument()
  })

  it('hides itself once Decline is clicked', async () => {
    const user = userEvent.setup()
    renderBanner()
    await user.click(screen.getByRole('button', { name: /^decline$/i }))
    expect(screen.queryByRole('button', { name: /^decline$/i })).not.toBeInTheDocument()
  })

  it('renders nothing when a choice was already made before mount', () => {
    setCookieConsent('declined')
    renderBanner()
    expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/components/CookieConsentBanner.test.tsx`
Expected: FAIL — `Cannot find module './CookieConsentBanner'`

- [ ] **Step 3: Write the implementation**

```tsx
// dashboard/src/components/CookieConsentBanner.tsx
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { setCookieConsent, useCookieConsent } from '../hooks/useCookieConsent'

export function CookieConsentBanner() {
  const consent = useCookieConsent()
  if (consent !== null) return null

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-3 border-t border-border bg-background/95 p-4 backdrop-blur sm:flex-row sm:justify-between"
    >
      <p className="text-sm text-muted-foreground">
        We use analytics cookies to understand how the app is used. See our{' '}
        <Link to="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={() => setCookieConsent('declined')}>
          Decline
        </Button>
        <Button size="sm" onClick={() => setCookieConsent('accepted')}>
          Accept
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/components/CookieConsentBanner.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/CookieConsentBanner.tsx dashboard/src/components/CookieConsentBanner.test.tsx
git commit -m "feat(privacy): add cookie consent banner"
```

---

### Task 3: gtag.js loader utility

**Files:**
- Create: `dashboard/src/lib/loadGtag.ts`
- Test: `dashboard/src/lib/loadGtag.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// dashboard/src/lib/loadGtag.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { loadGtag } from './loadGtag'

describe('loadGtag', () => {
  afterEach(() => {
    document.getElementById('ga4-gtag-script')?.remove()
    // @ts-expect-error test cleanup of a runtime global
    delete window.dataLayer
    // @ts-expect-error test cleanup of a runtime global
    delete window.gtag
  })

  it('injects the gtag.js script tag pointed at the given measurement ID', () => {
    loadGtag('G-TEST123')
    const script = document.getElementById('ga4-gtag-script') as HTMLScriptElement
    expect(script).not.toBeNull()
    expect(script.src).toContain('G-TEST123')
  })

  it('initializes window.dataLayer and window.gtag', () => {
    loadGtag('G-TEST123')
    expect(window.dataLayer).toBeDefined()
    expect(typeof window.gtag).toBe('function')
  })

  it('does not inject a second script tag if called again', () => {
    loadGtag('G-TEST123')
    loadGtag('G-TEST123')
    expect(document.querySelectorAll('#ga4-gtag-script')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/lib/loadGtag.test.ts`
Expected: FAIL — `Cannot find module './loadGtag'`

- [ ] **Step 3: Write the implementation**

```ts
// dashboard/src/lib/loadGtag.ts
declare global {
  interface Window {
    dataLayer: unknown[][]
    gtag: (...args: unknown[]) => void
  }
}

const SCRIPT_ID = 'ga4-gtag-script'

/**
 * Injects the gtag.js loader script and initializes GA4 with the given
 * measurement ID. No-ops if already loaded — safe to call from an effect
 * that can re-run (e.g. consent flipping from null to "accepted").
 * send_page_view is off; useGoogleAnalytics fires page_view manually on
 * route change instead, since GA4 doesn't auto-track client-side routing.
 */
export function loadGtag(measurementId: string): void {
  if (document.getElementById(SCRIPT_ID)) return

  const script = document.createElement('script')
  script.id = SCRIPT_ID
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer ?? []
  window.gtag = (...args: unknown[]) => {
    window.dataLayer.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('config', measurementId, { send_page_view: false })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/lib/loadGtag.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/loadGtag.ts dashboard/src/lib/loadGtag.test.ts
git commit -m "feat(analytics): add gtag.js loader utility"
```

---

### Task 4: useGoogleAnalytics hook

**Files:**
- Create: `dashboard/src/hooks/useGoogleAnalytics.ts`
- Test: `dashboard/src/hooks/useGoogleAnalytics.test.tsx`

**Depends on:** Tasks 1 and 3.

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/hooks/useGoogleAnalytics.test.tsx
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useGoogleAnalytics } from './useGoogleAnalytics'
import { setCookieConsent } from './useCookieConsent'

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/app']}>{children}</MemoryRouter>
}

describe('useGoogleAnalytics', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    document.getElementById('ga4-gtag-script')?.remove()
    window.localStorage.clear()
    // @ts-expect-error test cleanup of a runtime global
    delete window.dataLayer
    // @ts-expect-error test cleanup of a runtime global
    delete window.gtag
  })

  it('does not load GA when consent has not been given', () => {
    renderHook(() => useGoogleAnalytics(), { wrapper })
    expect(document.getElementById('ga4-gtag-script')).toBeNull()
  })

  it('does not load GA when consent is declined', () => {
    setCookieConsent('declined')
    renderHook(() => useGoogleAnalytics(), { wrapper })
    expect(document.getElementById('ga4-gtag-script')).toBeNull()
  })

  it('loads GA once consent is accepted', () => {
    setCookieConsent('accepted')
    renderHook(() => useGoogleAnalytics(), { wrapper })
    expect(document.getElementById('ga4-gtag-script')).not.toBeNull()
  })

  it('does not load GA when no measurement ID is configured', () => {
    vi.unstubAllEnvs()
    setCookieConsent('accepted')
    renderHook(() => useGoogleAnalytics(), { wrapper })
    expect(document.getElementById('ga4-gtag-script')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/hooks/useGoogleAnalytics.test.tsx`
Expected: FAIL — `Cannot find module './useGoogleAnalytics'`

- [ ] **Step 3: Write the implementation**

```ts
// dashboard/src/hooks/useGoogleAnalytics.ts
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { loadGtag } from '../lib/loadGtag'
import { useCookieConsent } from './useCookieConsent'

/**
 * Loads GA4 only once the visitor has accepted the cookie-consent banner,
 * and only when a measurement ID is actually configured. Fires a manual
 * page_view on every route change (GA4 doesn't auto-track client-side
 * router navigation). Reads import.meta.env fresh on every render, not at
 * module scope, so it stays testable via vi.stubEnv.
 */
export function useGoogleAnalytics(): void {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
  const consent = useCookieConsent()
  const location = useLocation()

  useEffect(() => {
    if (!measurementId || consent !== 'accepted') return
    loadGtag(measurementId)
  }, [measurementId, consent])

  useEffect(() => {
    if (!measurementId || consent !== 'accepted') return
    window.gtag?.('event', 'page_view', {
      page_path: location.pathname + location.search,
    })
  }, [measurementId, consent, location.pathname, location.search])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/hooks/useGoogleAnalytics.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/hooks/useGoogleAnalytics.ts dashboard/src/hooks/useGoogleAnalytics.test.tsx
git commit -m "feat(analytics): add useGoogleAnalytics hook with manual SPA page_view tracking"
```

---

### Task 5: Wire consent banner and analytics into App.tsx

**Files:**
- Modify: `dashboard/src/App.tsx`
- Modify: `dashboard/src/App.test.tsx`
- Modify: `dashboard/.env.example` (create the key if the file doesn't have one yet)

**Depends on:** Tasks 2 and 4, and Phase 4 Task 6 (`ThankYouPage` route) if that
phase is already implemented — this task's `App.tsx` snippet includes it;
drop that one route/import if Phase 4 hasn't landed yet.

- [ ] **Step 1: Extend App.test.tsx**

Add to `dashboard/src/App.test.tsx`:

```tsx
  it('shows the cookie consent banner on first visit', () => {
    renderAt('/')
    expect(screen.getByRole('button', { name: /^accept$/i })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/App.test.tsx`
Expected: FAIL — no consent banner rendered yet

- [ ] **Step 3: Update App.tsx**

Add the two imports:

```tsx
import { CookieConsentBanner } from './components/CookieConsentBanner'
import { useGoogleAnalytics } from './hooks/useGoogleAnalytics'
```

Call the hook and wrap the return value in a fragment with the banner as a
sibling of `<Routes>`:

```tsx
export default function App() {
  const location = useLocation()
  useGoogleAnalytics()
  return (
    <>
      <Routes>
        {/* ...all existing routes from Phases 1 and 4, unchanged... */}
      </Routes>
      <CookieConsentBanner />
    </>
  )
}
```

- [ ] **Step 4: Add the GA env var placeholder**

In `dashboard/.env.example`, add (create the file if it doesn't exist):

```
VITE_GA_MEASUREMENT_ID=
```

Leave it blank — GA simply doesn't load until a real `G-XXXXXXXXXX` value is
set (see `useGoogleAnalytics`'s `!measurementId` guard). Document in the repo
README or DEPLOY.md that this needs to be set in Vercel's environment
variables before/at launch — not part of this plan's file changes, just a
reminder for the exit check below.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/App.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full frontend suite**

Run: `cd dashboard && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/App.tsx dashboard/src/App.test.tsx dashboard/.env.example
git commit -m "feat(analytics): wire cookie consent banner and GA4 into App"
```

---

### Task 6: Privacy Policy page

**Files:**
- Create: `dashboard/src/pages/PrivacyPolicyPage.tsx`
- Test: `dashboard/src/pages/PrivacyPolicyPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/pages/PrivacyPolicyPage.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPolicyPage } from './PrivacyPolicyPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <PrivacyPolicyPage />
    </MemoryRouter>,
  )
}

describe('PrivacyPolicyPage', () => {
  it('renders a heading, the not-legal-advice disclaimer, and a unique title', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /privacy policy/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/not a lawyer/i)).toBeInTheDocument()
    expect(document.title).toBe('Privacy Policy — HedgeFund Simulator')
  })

  it('links back to the home page', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
  })

  it('mentions the actual data practices: no accounts, local storage, analytics consent, waitlist emails', () => {
    renderPage()
    expect(screen.getByText(/no sign-up/i)).toBeInTheDocument()
    expect(screen.getByText(/local storage/i)).toBeInTheDocument()
    expect(screen.getByText(/google analytics/i)).toBeInTheDocument()
    expect(screen.getByText(/get notified about new features/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/pages/PrivacyPolicyPage.test.tsx`
Expected: FAIL — `Cannot find module './PrivacyPolicyPage'`

- [ ] **Step 3: Write the implementation**

```tsx
// dashboard/src/pages/PrivacyPolicyPage.tsx
import { Link } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'

const LAST_UPDATED = 'August 13, 2026'

export function PrivacyPolicyPage() {
  usePageMeta(
    'Privacy Policy — HedgeFund Simulator',
    'What HedgeFund Simulator collects, why, and the choices you have.',
  )

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <div>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to home
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </div>

      <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        This page is a plain-language description of what this app actually does, written by
        the people who built it — not a lawyer. It has not been reviewed by legal counsel. If
        you need this to be legally binding (for example, because you expect visitors in the
        EU or California), have it reviewed before relying on it.
      </p>

      <section>
        <h2 className="mb-2 text-xl font-semibold">No account required</h2>
        <p className="text-muted-foreground">
          HedgeFund Simulator has no sign-up, no login, and no passwords. There is one shared
          demo portfolio that every visitor sees and trades against — we don't attach any of
          your activity to your identity, because we have no way to know who you are.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">What we store locally in your browser</h2>
        <p className="text-muted-foreground">
          Two small preferences live in your browser's local storage and never leave your
          device: whether you've turned the AI advisor on or off, and your cookie-consent
          choice from the banner. Clearing your browser storage clears both.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">Analytics cookies</h2>
        <p className="text-muted-foreground">
          If you accept the cookie banner, we load Google Analytics to understand which pages
          are visited and how often. It only loads after you accept — declining, or not
          answering, means it never loads. You can change your mind at any time by clearing
          your browser's local storage for this site, which brings the banner back.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">If you sign up to be notified</h2>
        <p className="text-muted-foreground">
          If you submit your email through the "Get notified about new features" form, we
          store that email address so we can contact you about the product. We don't sell or
          share it with anyone else. Email us (below) if you'd like it removed.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">Server logs</h2>
        <p className="text-muted-foreground">
          Like effectively every website, our hosting infrastructure keeps standard access
          logs (IP address, timestamp, requested path) for operating and securing the
          service. We don't use these logs for tracking or analytics.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">Contact</h2>
        <p className="text-muted-foreground">
          Questions about this policy or your data?{' '}
          <a
            href="mailto:malkarichayan1@gmail.com"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Email us
          </a>
          .
        </p>
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/pages/PrivacyPolicyPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/PrivacyPolicyPage.tsx dashboard/src/pages/PrivacyPolicyPage.test.tsx
git commit -m "feat(privacy): add Privacy Policy page"
```

---

### Task 7: Wire the /privacy route and update the sitemap

**Files:**
- Modify: `dashboard/src/App.tsx`
- Modify: `dashboard/src/App.test.tsx`
- Modify: `dashboard/public/sitemap.xml`

**Depends on:** Task 6, Phase 1 (`App.tsx`, `sitemap.xml`).

- [ ] **Step 1: Add a routing test**

Add to `dashboard/src/App.test.tsx`:

```tsx
  it('renders the Privacy Policy page at /privacy', () => {
    renderAt('/privacy')
    expect(screen.getByRole('heading', { level: 1, name: /privacy policy/i })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/App.test.tsx`
Expected: FAIL — no `/privacy` route yet

- [ ] **Step 3: Add the route**

In `dashboard/src/App.tsx`, add the import:

```tsx
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
```

And add the route as a sibling of `/` and `/thank-you`:

```tsx
      <Route path="/" element={<LandingPage />} />
      <Route path="/thank-you" element={<ThankYouPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
```

(Drop the `/thank-you` line if Phase 4 hasn't been implemented yet.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Add /privacy to the sitemap**

Replace the contents of `dashboard/public/sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://crypto-quant-lab.vercel.app/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://crypto-quant-lab.vercel.app/privacy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
```

- [ ] **Step 6: Run the full frontend suite**

Run: `cd dashboard && npm run build && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/App.tsx dashboard/src/App.test.tsx dashboard/public/sitemap.xml
git commit -m "feat(privacy): add /privacy route and list it in sitemap.xml"
```

---

## Phase 5 exit check

```bash
cd dashboard && npm run build && npm test
```

Manually smoke-test in the dev server: on first visit, confirm the cookie
banner appears; click Decline and confirm no `gtag.js` request appears in
DevTools' Network tab; clear local storage, reload, click Accept, and (with
a real `VITE_GA_MEASUREMENT_ID` set in `.env.local` for this check only)
confirm a `gtag/js` request fires and a `page_view` event appears in
GA4 DebugView when navigating between routes. Visit `/privacy` and read
it end to end for accuracy against whatever the app actually does at that
point.
