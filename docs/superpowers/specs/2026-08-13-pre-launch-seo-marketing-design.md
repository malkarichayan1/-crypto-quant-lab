# Pre-Launch SEO, Marketing & Compliance Surface — Design Spec

**Date:** 2026-08-13
**Project:** AI Crypto Hedge Fund Simulator
**Slice:** Public-facing landing page, SEO infrastructure, analytics, and legal page — added in front of the existing beginner dashboard before public launch

---

## 1. Purpose

The user requested a checklist of 18 pre-launch items (custom 404, above-fold CTA,
internal links, thank-you page, breadcrumbs, case studies, 5 FAQs, response-time
prompt, sticky mobile CTA, robots.txt, unique page titles, meta descriptions,
social share image, maps + directions, real reviews, alt text, local schema,
privacy policy page, Google Analytics).

The app today is a **client-only React SPA** (Vite + react-router-dom) with **no
separate marketing site** — `/` renders the live trading dashboard directly, there
is no auth/login, and the single shared demo portfolio has no per-visitor
separation. Several requested items assume a different kind of product (a
local/lead-gen business site with a physical location and existing customers) and
don't map onto this app as-is. Those mismatches were resolved with the user
before this spec was written (see Decisions below) rather than guessed at.

This spec covers building a real public landing page in front of the existing
app, the SEO/analytics/legal infrastructure to support it, and explicitly
excludes anything that would require fabricating content (fake reviews, fake
case studies, a fictitious business address).

---

## 2. Decisions made during brainstorming

| Question | Decision |
|---|---|
| Reviews/testimonials | **Skip entirely for launch.** No fabricated reviews will be built or populated. Real ones can be added post-launch once real users exist. |
| Case studies | **Skip entirely for launch**, same reasoning — no fake customer stories. |
| Maps + directions, local business schema | **Dropped.** No physical location exists to promote; this was boilerplate from a generic local-SEO checklist that doesn't apply to a web app. |
| Where do CTA/FAQ/breadcrumbs/thank-you-page live | **New public landing page** at `/`; the existing dashboard moves to `/app`. |
| Domain | Keep `crypto-quant-lab.vercel.app` (no custom domain purchase planned right now). |
| Thank-you page | **Build a real trigger for it** — a lightweight email-capture ("get notified" / contact) form that the thank-you page follows. |
| Email form backend | **New FastAPI endpoint + Neon Postgres table** (matches existing stack), not a third-party form vendor. |
| Response-time prompt | **Email support only.** Address: `malkarichayan1@gmail.com`. Promise: "We typically reply within 24 hours." |
| Google Analytics ID | Not available yet — **wire in a placeholder env var**, user swaps in the real GA4 measurement ID before/at launch. |
| FAQ schema (`FAQPage` JSON-LD) | Proposed as a natural pairing with the "5 FAQs" item (distinct from the dropped "local schema") — **approved**. |
| Cookie consent banner gating GA | Proposed as a necessary companion to the Privacy Policy page — **approved**. |

---

## 3. Success criteria

- A first-time visitor landing on `/` sees a clear value proposition and a
  primary CTA above the fold, without needing to scroll.
- All 18 checklist items are either implemented, explicitly and intentionally
  dropped (reviews, case studies, maps/local schema — documented above), or
  deferred to the user to supply a real value (GA ID, and optionally a custom
  domain later).
- No fabricated people, quotes, businesses, or addresses appear anywhere on the
  site.
- Every existing bookmark/deep link into the current app (`/markets`,
  `/portfolio`, `/lab/backtests/:id`, etc.) still resolves correctly via
  redirect — nothing that works today breaks.
- The Privacy Policy accurately reflects what the app actually collects (no
  accounts, no auth cookies, `localStorage` UI toggle only, GA4 analytics behind
  consent, waitlist emails) — verified against the actual codebase, not assumed.
- `pnpm build && pnpm test` (frontend) and `pytest` (backend) stay green; new
  backend code (waitlist endpoint) has unit + integration test coverage
  consistent with the existing suite's bar.

---

## 4. Scope

### In scope

- New landing page at `/` (hero + CTA, FAQ accordion + `FAQPage` schema, footer
  with internal links, sticky mobile CTA, response-time note).
- Existing dashboard moved to `/app/*`, with redirects from every current
  bare path.
- Custom 404 page (SPA catch-all route) with `noindex` meta.
- `/thank-you` page and `/privacy` page.
- New backend: `POST /waitlist` endpoint + Alembic migration for a
  `waitlist_signups` table, with honeypot + rate limiting.
- `robots.txt` and `sitemap.xml` static files.
- Per-route document title + meta description via a small custom hook (no new
  dependency).
- Canonical URL + OG/Twitter card meta tags, with a generated 1200×630 social
  share image built from the app's existing dark theme tokens.
- Alt-text audit pass across existing image-bearing components.
- GA4 integration (placeholder measurement ID) with manual SPA route-change
  tracking, gated behind a minimal cookie-consent banner.
- Privacy Policy page content, drafted from the codebase's actual data
  practices, with an explicit "not legal advice, have counsel review before
  public launch" disclaimer on the page and in the handoff.

### Explicitly out of scope

- Reviews/testimonials section (any content, real or placeholder-labeled).
- Case studies section.
- Maps/directions, `LocalBusiness` schema.
- Purchasing/configuring a custom domain.
- Creating a live Google Analytics property or obtaining a real measurement ID.
- Legal review of the Privacy Policy by an actual attorney.
- Any change to authentication/accounts (none exist today; not being added).
- Terms of Service (not requested — flagging that a Privacy Policy alone is
  common but a ToS is usually paired with it; can be a fast follow if wanted).

---

## 5. Site structure & routing

`dashboard/src/App.tsx` currently mounts one `<Routes>` tree entirely under the
dashboard `AppShell`. This changes to two top-level trees:

```
/                      → LandingPage (new, no AppShell)
/thank-you             → ThankYouPage (new, no AppShell)
/privacy               → PrivacyPolicyPage (new, no AppShell)
/app                    ┐
/app/markets            │
/app/coins/:symbol      │  AppShell + existing pages, unchanged internally,
/app/portfolio          │  just mounted one level deeper
/app/leaderboard        │
/app/news               │
/app/settings           │
/app/lab/*              ┘

# Redirects (same pattern as the existing legacy-redirect block)
/markets, /portfolio, /leaderboard, /news, /settings,
/lab/*, /history, /research*, /paper*   → /app/... (Navigate, replace: true)

*  (unmatched)          → NotFoundPage (noindex)
```

- `NotFoundPage` gets `usePageMeta('Page not found', ...)` plus a
  `<meta name="robots" content="noindex">` — necessary because Vercel's SPA
  rewrite (`dashboard/vercel.json`) always serves `index.html` with HTTP 200,
  so there's no real 404 status to rely on; the meta tag is how we tell crawlers
  not to index these paths.
- Breadcrumbs are added to nested `/app` pages where there's real hierarchy to
  show (`AssetPage` → `Home > Markets > {symbol}`, lab result pages → `Home >
  Strategy Lab > Backtests > {id}`) — not on the single-page landing site.
- `AppShell`'s internal links (sidebar, "back to dashboard" etc.) get updated to
  the new `/app`-prefixed paths.

---

## 6. Landing page content

New `dashboard/src/pages/LandingPage.tsx` (plus small sub-components), matching
the existing dark-theme token system in `src/styles/tokens.css` — not a generic
template.

- **Hero + above-fold CTA**: one-line value proposition, primary button
  ("Start simulating free" → `/app`), no scroll required to see it.
- **FAQ accordion**, 5 items answering real first-time-user questions (what is
  this, is it real money, how do I start, is my data safe, is this financial
  advice). Rendered content also emitted as `FAQPage` JSON-LD in the page
  `<head>` for rich-result eligibility.
- **Footer**: internal links to Markets, FAQ anchor, Privacy Policy, and the
  "Start simulating" CTA again — the "internal links" checklist item.
- **Sticky mobile CTA**: fixed bottom bar, mobile viewport only, same
  destination as the hero CTA, dismiss-free (single persistent element, not a
  popup).
- **Response-time note**: near the email-capture form, "We typically reply
  within 24 hours" with a `mailto:malkarichayan1@gmail.com` link.
- **Email-capture form** ("Get notified" / contact form) — see backend section
  below — submits and routes to `/thank-you` on success; inline error message
  on failure (never a silent failure).

No reviews or case-study sections are built.

---

## 7. Email capture → thank-you page (backend)

- New route module, e.g. `src/hedgefund/api/routes/waitlist.py`:
  `POST /waitlist` accepting `{ email: str }`.
- New Alembic migration adding `waitlist_signups` (`id`, `email` unique,
  `created_at`), following the existing migration conventions in
  `migrations/versions/`.
- Server-side validation via Pydantic + `email-validator` (already common in
  this kind of stack; add if not already a dependency).
- **Spam protection**: a hidden honeypot field (rejected silently as success if
  filled, per standard honeypot practice) + basic rate limiting on the endpoint
  (per-IP, matches the "rate limiting on submission endpoints" rule already in
  this repo's security guidelines).
- Duplicate submissions (same email) are treated as idempotent success, not an
  error — no user-facing "already registered" leak.
- Frontend: a small typed API client function (`src/api/waitlist.ts`, matching
  the existing `src/api/*.ts` pattern) called from the landing page form.

---

## 8. SEO infrastructure

- **`usePageMeta(title, description)`** hook (`src/hooks/usePageMeta.ts`): sets
  `document.title` and upserts a `<meta name="description">` tag on mount/update.
  No new dependency — deliberately simpler than `react-helmet-async` since this
  is a client-only SPA with no SSR to coordinate with.
- **`dashboard/public/robots.txt`**: allows the public routes, `Disallow: /app`
  (a shared live demo portfolio, not indexable content — keeps crawl budget on
  real marketing content), references the sitemap.
- **`dashboard/public/sitemap.xml`**: lists only `/`, `/privacy` (not `/app/*`,
  not `/thank-you` since it's a post-action confirmation page, not a content
  destination).
- **Canonical + OG/Twitter tags**: static sensible defaults added to
  `index.html` (title, description, `og:image`, `twitter:card=summary_large_image`,
  canonical pointed at `crypto-quant-lab.vercel.app`), with title/description
  overridden per-route by the hook above.
- **Social share image**: no existing logo/brand asset in the repo today. Built
  during implementation as a static 1200×630 PNG using the app's real palette
  (`--color-bg`, `--color-accent`, etc. from `tokens.css`) — rendered via a
  headless-browser screenshot of a small purpose-built HTML template, not a
  stock image.
- **Alt text**: audit `CoinIcon` and other image-bearing components
  (`MarketCard`, chart legends, etc.); meaningful `alt` on informative images,
  `aria-hidden="true"` + empty `alt=""` on purely decorative ones.

---

## 9. Analytics & consent

- `gtag.js` loaded conditionally when `VITE_GA_MEASUREMENT_ID` is set (never in
  local dev unless explicitly configured) — placeholder value committed, real
  ID swapped in by the user via Vercel env vars before/at launch.
- A route-change listener fires a manual `page_view` event on every navigation
  (GA4 does not auto-track client-side router transitions).
- A minimal cookie-consent banner (accept/decline) gates whether GA loads at
  all — shown once, choice persisted in `localStorage`. This directly backs the
  claims made in the Privacy Policy; without it the policy would describe
  behavior the app doesn't actually implement.

---

## 10. Privacy Policy page

`/privacy` content is drafted strictly from what the codebase actually does,
confirmed during brainstorming:

- No user accounts, no login, no auth cookies.
- `localStorage` used only for one UI preference (advisor-enabled toggle) and
  the new cookie-consent choice.
- Single shared demo portfolio — no per-visitor personal financial data.
- Waitlist emails stored server-side (new, per section 7).
- GA4 analytics, active only after consent (per section 9).
- Standard server access logs (IP, timestamp) as any backend naturally has.

The page carries an explicit disclaimer: *this is not legal advice, and the
user should have this reviewed by an attorney before public launch* —
especially relevant if EU/California visitors are expected (GDPR/CCPA). This
disclaimer is stated both on the page itself (in plain, honest language, not
buried) and repeated in the implementation handoff notes.

---

## 11. Testing

- Frontend: new components/pages/hooks get co-located `.test.tsx`/`.test.ts`
  files matching the existing convention (every existing component in
  `src/components/` and `src/pages/` has one). Cover: landing page renders CTA
  above the fold, FAQ accordion expands, form validation + success/error
  states, redirect routes resolve, 404 route renders with `noindex`.
- Backend: `tests/api/` gets a new test module for the waitlist endpoint —
  happy path, duplicate email, honeypot-filled request, rate-limit exceeded,
  invalid email format.
- No visual regression tooling exists in this repo today; manual check at
  320/768/1024/1440 breakpoints for the new landing page during implementation
  is sufficient — not introducing a new Playwright visual-diff pipeline for
  this slice.

---

## 12. Open items for the user (not blocking implementation)

- Real GA4 measurement ID (placeholder ships until provided).
- Whether to eventually use a dedicated support alias instead of a personal
  Gmail address on a public page (spam-harvesting risk) — not blocking, callable
  later.
- Whether a Terms of Service page is wanted alongside the Privacy Policy.
- Custom domain (currently out of scope; revisit if purchased).
