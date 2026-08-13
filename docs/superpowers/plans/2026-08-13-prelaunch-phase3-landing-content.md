# Pre-Launch Phase 3: Landing Page Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round out the landing page with a 5-item FAQ (plus `FAQPage` schema), a footer with internal links and the response-time note, and a sticky mobile CTA — everything from spec section 6 except the email-capture form (Phase 4).

**Architecture:** Three new presentational components under `dashboard/src/components/landing/` (matching the existing `components/spec-form/` subfolder precedent for a cohesive feature area), composed into the existing `LandingPage.tsx` from Phase 1/2. A new generic `useJsonLd` hook (sibling to `usePageMeta`) injects the `FAQPage` structured-data script tag, built from the same `FAQ_ITEMS` array that renders the accordion — one source of truth, no risk of the schema drifting from the visible content.

**Tech Stack:** React 18, Tailwind v4, `lucide-react` (already a dependency). No new dependencies.

Reference spec: `docs/superpowers/specs/2026-08-13-pre-launch-seo-marketing-design.md`, section 6.

**Depends on:** Phase 1 (`LandingPage.tsx` exists) and Phase 2 (`usePageMeta` exists). One FAQ answer and one footer link point at `/privacy`, which doesn't exist until Phase 5 — those links 404 gracefully via `NotFoundPage` until Phase 5 ships. Fine to build/commit in this order; just deploy Phase 5 before or alongside this one if you want the link live immediately.

---

### Task 1: useJsonLd hook

**Files:**
- Create: `dashboard/src/hooks/useJsonLd.ts`
- Test: `dashboard/src/hooks/useJsonLd.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/hooks/useJsonLd.test.tsx
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useJsonLd } from './useJsonLd'

describe('useJsonLd', () => {
  it('injects a script[type=application/ld+json] tag with the given id and data', () => {
    renderHook(() => useJsonLd('test-schema', { '@type': 'Thing', name: 'Example' }))
    const script = document.querySelector('script[data-json-ld-id="test-schema"]')
    expect(script).not.toBeNull()
    expect(script?.getAttribute('type')).toBe('application/ld+json')
    expect(JSON.parse(script!.textContent ?? '{}')).toEqual({ '@type': 'Thing', name: 'Example' })
  })

  it('removes the script tag on unmount', () => {
    const { unmount } = renderHook(() => useJsonLd('test-schema-2', { a: 1 }))
    expect(document.querySelector('script[data-json-ld-id="test-schema-2"]')).not.toBeNull()
    unmount()
    expect(document.querySelector('script[data-json-ld-id="test-schema-2"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/hooks/useJsonLd.test.tsx`
Expected: FAIL — `Cannot find module './useJsonLd'`

- [ ] **Step 3: Write the implementation**

```ts
// dashboard/src/hooks/useJsonLd.ts
import { useEffect } from 'react'

/**
 * Injects a <script type="application/ld+json"> tag into document.head for
 * as long as the calling component is mounted, removing it on unmount.
 * `id` scopes the tag so multiple structured-data blocks can coexist.
 * Callers should pass a stable `data` reference (e.g. a module-level
 * constant) — a fresh object literal on every render would re-run this
 * effect on every render too.
 */
export function useJsonLd(id: string, data: unknown): void {
  useEffect(() => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.dataset.jsonLdId = id
    script.textContent = JSON.stringify(data)
    document.head.appendChild(script)

    return () => {
      script.remove()
    }
  }, [id, data])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/hooks/useJsonLd.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/hooks/useJsonLd.ts dashboard/src/hooks/useJsonLd.test.tsx
git commit -m "feat(seo): add useJsonLd hook for structured data"
```

---

### Task 2: FAQ section with FAQPage schema

**Files:**
- Create: `dashboard/src/components/landing/FaqSection.tsx`
- Test: `dashboard/src/components/landing/FaqSection.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/components/landing/FaqSection.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { FaqSection, FAQ_ITEMS } from './FaqSection'

function renderSection() {
  return render(
    <MemoryRouter>
      <FaqSection />
    </MemoryRouter>,
  )
}

describe('FaqSection', () => {
  it('renders exactly 5 collapsed questions', () => {
    renderSection()
    const section = screen.getByRole('heading', { name: /frequently asked questions/i }).closest(
      'section',
    )!
    expect(within(section).getAllByRole('button')).toHaveLength(5)
    expect(FAQ_ITEMS).toHaveLength(5)
  })

  it('reveals the answer when a question is clicked, and hides it again on a second click', async () => {
    const user = userEvent.setup()
    renderSection()
    const firstQuestion = screen.getByRole('button', { name: FAQ_ITEMS[0].question })
    expect(firstQuestion).toHaveAttribute('aria-expanded', 'false')

    await user.click(firstQuestion)
    expect(firstQuestion).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(FAQ_ITEMS[0].answer)).toBeInTheDocument()

    await user.click(firstQuestion)
    expect(firstQuestion).toHaveAttribute('aria-expanded', 'false')
  })

  it('links the data-collection answer to the Privacy Policy page', async () => {
    const user = userEvent.setup()
    renderSection()
    const dataQuestion = screen.getByRole('button', { name: /what data do you collect/i })
    await user.click(dataQuestion)
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('emits FAQPage JSON-LD matching the rendered questions', () => {
    renderSection()
    const script = document.querySelector('script[data-json-ld-id="faq-schema"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.textContent ?? '{}')
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(5)
    expect(data.mainEntity[0].name).toBe(FAQ_ITEMS[0].question)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/components/landing/FaqSection.test.tsx`
Expected: FAIL — `Cannot find module './FaqSection'`

- [ ] **Step 3: Write the implementation**

```tsx
// dashboard/src/components/landing/FaqSection.tsx
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useJsonLd } from '../../hooks/useJsonLd'

export type FaqItem = { question: string; answer: string; privacyLink?: boolean }

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Is this real money?',
    answer:
      'No. You start with $100,000 in virtual cash and every trade is simulated — nothing ever touches a real exchange or a real bank account.',
  },
  {
    question: 'Do I need to sign up?',
    answer: 'No account or sign-up is required. Open the app and start trading immediately.',
  },
  {
    question: 'Is the AI advice financial advice?',
    answer:
      'No. Suggestions are generated for learning purposes only, grounded in real indicator signals, and are never a recommendation to trade with real money.',
  },
  {
    question: 'Where do the prices come from?',
    answer:
      'Live market prices come from real exchange data, so charts and fills behave like the real market — only the money is fake.',
  },
  {
    question: 'What data do you collect?',
    answer: "Very little — there's no account or password to create. See our Privacy Policy for the full picture.",
    privacyLink: true,
  },
]

// Computed once at module load, not per-render, so useJsonLd gets a stable
// reference and doesn't re-run its effect on every FaqSection render.
const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
}

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  useJsonLd('faq-schema', FAQ_JSON_LD)

  return (
    <section aria-labelledby="faq-heading" className="mx-auto w-full max-w-2xl px-6 py-16">
      <h2 id="faq-heading" className="mb-6 text-center text-2xl font-bold">
        Frequently asked questions
      </h2>
      <dl className="flex flex-col gap-2">
        {FAQ_ITEMS.map((item, index) => {
          const isOpen = openIndex === index
          const panelId = `faq-panel-${index}`
          return (
            <div key={item.question} className="rounded-lg border border-border">
              <dt>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-medium"
                >
                  {item.question}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      'size-4 shrink-0 transition-transform duration-200',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>
              </dt>
              {isOpen && (
                <dd id={panelId} className="px-4 pb-4 text-sm text-muted-foreground">
                  {item.privacyLink ? (
                    <>
                      There's no account or password to create.{' '}
                      <Link to="/privacy" className="underline underline-offset-2">
                        See our Privacy Policy
                      </Link>{' '}
                      for the full picture.
                    </>
                  ) : (
                    item.answer
                  )}
                </dd>
              )}
            </div>
          )
        })}
      </dl>
    </section>
  )
}
```

Note: the rendered text for the `privacyLink` item deliberately differs
slightly from `item.answer` (real `<Link>` vs. plain text for the schema) —
both say the same thing, just one is clickable.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/components/landing/FaqSection.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/landing/FaqSection.tsx dashboard/src/components/landing/FaqSection.test.tsx
git commit -m "feat(landing): add FAQ accordion with FAQPage schema"
```

---

### Task 3: Site footer with internal links and response-time note

**Files:**
- Create: `dashboard/src/components/landing/SiteFooter.tsx`
- Test: `dashboard/src/components/landing/SiteFooter.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/components/landing/SiteFooter.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SiteFooter } from './SiteFooter'

function renderFooter() {
  return render(
    <MemoryRouter>
      <SiteFooter />
    </MemoryRouter>,
  )
}

describe('SiteFooter', () => {
  it('links to Markets, the FAQ anchor, Privacy Policy, and the app', () => {
    renderFooter()
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: /^markets$/i })).toHaveAttribute(
      'href',
      '/app/markets',
    )
    expect(within(footer).getByRole('link', { name: /^faq$/i })).toHaveAttribute(
      'href',
      '#faq-heading',
    )
    expect(within(footer).getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
    expect(within(footer).getByRole('link', { name: /start simulating/i })).toHaveAttribute(
      'href',
      '/app',
    )
  })

  it('shows a response-time note with a mailto link', () => {
    renderFooter()
    const link = screen.getByRole('link', { name: /email us/i })
    expect(link).toHaveAttribute('href', 'mailto:malkarichayan1@gmail.com')
    expect(screen.getByText(/within 24 hours/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/components/landing/SiteFooter.test.tsx`
Expected: FAIL — `Cannot find module './SiteFooter'`

- [ ] **Step 3: Write the implementation**

```tsx
// dashboard/src/components/landing/SiteFooter.tsx
import { Link } from 'react-router-dom'

export function SiteFooter() {
  return (
    <footer className="border-t border-border px-6 py-10 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <p>
          Questions?{' '}
          <a
            href="mailto:malkarichayan1@gmail.com"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Email us
          </a>{' '}
          — we typically reply within 24 hours.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-4">
          <Link to="/app/markets" className="hover:text-foreground">
            Markets
          </Link>
          <a href="#faq-heading" className="hover:text-foreground">
            FAQ
          </a>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
          <Link to="/app" className="font-medium text-foreground hover:underline">
            Start simulating
          </Link>
        </nav>
        <p className="text-xs">
          © {new Date().getFullYear()} HedgeFund Simulator. Simulated trading only — not
          financial advice.
        </p>
      </div>
    </footer>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/components/landing/SiteFooter.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/landing/SiteFooter.tsx dashboard/src/components/landing/SiteFooter.test.tsx
git commit -m "feat(landing): add site footer with internal links and response-time note"
```

---

### Task 4: Sticky mobile CTA

**Files:**
- Create: `dashboard/src/components/landing/StickyMobileCta.tsx`
- Test: `dashboard/src/components/landing/StickyMobileCta.test.tsx`

jsdom has no real layout engine, so this test can't verify the CSS media
query actually hides the bar on desktop — it confirms the component renders
the right link and carries the `sm:hidden` class that does that hiding.

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/components/landing/StickyMobileCta.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StickyMobileCta } from './StickyMobileCta'

describe('StickyMobileCta', () => {
  it('renders a CTA into the app, hidden above the sm breakpoint', () => {
    render(
      <MemoryRouter>
        <StickyMobileCta />
      </MemoryRouter>,
    )
    const bar = screen.getByTestId('sticky-mobile-cta')
    expect(bar.className).toContain('sm:hidden')
    const link = screen.getByRole('link', { name: /start simulating/i })
    expect(link).toHaveAttribute('href', '/app')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/components/landing/StickyMobileCta.test.tsx`
Expected: FAIL — `Cannot find module './StickyMobileCta'`

- [ ] **Step 3: Write the implementation**

```tsx
// dashboard/src/components/landing/StickyMobileCta.tsx
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function StickyMobileCta() {
  return (
    <div
      data-testid="sticky-mobile-cta"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur sm:hidden"
    >
      <Button asChild size="lg" className="w-full">
        <Link to="/app">Start simulating — it's free</Link>
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/components/landing/StickyMobileCta.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/landing/StickyMobileCta.tsx dashboard/src/components/landing/StickyMobileCta.test.tsx
git commit -m "feat(landing): add sticky mobile CTA bar"
```

---

### Task 5: Compose everything into LandingPage

**Files:**
- Modify: `dashboard/src/pages/LandingPage.tsx`
- Modify: `dashboard/src/pages/LandingPage.test.tsx`

**Depends on:** Tasks 1–4.

- [ ] **Step 1: Replace LandingPage.test.tsx**

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
    const ctas = screen.getAllByRole('link', { name: /start simulating/i })
    expect(ctas.length).toBeGreaterThan(0)
    for (const cta of ctas) {
      expect(cta).toHaveAttribute('href', '/app')
    }
  })

  it('sets a unique title and description', () => {
    renderPage()
    expect(document.title).toBe('HedgeFund Simulator — Practice investing risk-free')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      'Trade crypto with $100,000 in virtual cash, real market prices, and free AI advice. No real money, ever.',
    )
  })

  it('renders the FAQ section', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /frequently asked questions/i })).toBeInTheDocument()
  })

  it('renders the footer', () => {
    renderPage()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('renders the sticky mobile CTA', () => {
    renderPage()
    expect(screen.getByTestId('sticky-mobile-cta')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/pages/LandingPage.test.tsx`
Expected: FAIL — `renders the FAQ section` / `renders the footer` / `renders the sticky mobile CTA` all fail (not composed in yet); the first test also now fails since `getAllByRole` finds only 1 CTA instead of what will become 3.

- [ ] **Step 3: Update LandingPage.tsx**

```tsx
// dashboard/src/pages/LandingPage.tsx
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../hooks/usePageMeta'
import { FaqSection } from '../components/landing/FaqSection'
import { SiteFooter } from '../components/landing/SiteFooter'
import { StickyMobileCta } from '../components/landing/StickyMobileCta'

export function LandingPage() {
  usePageMeta(
    'HedgeFund Simulator — Practice investing risk-free',
    'Trade crypto with $100,000 in virtual cash, real market prices, and free AI advice. No real money, ever.',
  )

  return (
    // pb-20 keeps footer content clear of the fixed sticky CTA bar on mobile.
    <div className="pb-20 sm:pb-0">
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
      <FaqSection />
      <SiteFooter />
      <StickyMobileCta />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/pages/LandingPage.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the App-level routing test to confirm no regression**

Run: `cd dashboard && npm test -- src/App.test.tsx`
Expected: PASS — `renders the landing page at /` used `getByRole('link', { name: /start simulating/i })`
(singular). If it now fails on "multiple elements", update that one assertion in
`dashboard/src/App.test.tsx` to match the Step 1 pattern above
(`getAllByRole` + loop), then re-run.

- [ ] **Step 6: Run the full frontend suite**

Run: `cd dashboard && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/pages/LandingPage.tsx dashboard/src/pages/LandingPage.test.tsx dashboard/src/App.test.tsx
git commit -m "feat(landing): compose FAQ, footer, and sticky CTA into the landing page"
```

---

## Phase 3 exit check

```bash
cd dashboard && npm run build && npm test
```

Manually smoke-test in the dev server at a mobile viewport width (e.g. 375px
via DevTools device toolbar): confirm the sticky CTA bar appears at the
bottom and doesn't overlap the footer; at desktop width confirm it's hidden.
Click through each FAQ question and each footer link.
