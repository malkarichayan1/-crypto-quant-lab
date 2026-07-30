# Beginner Frontend Redesign — Phase 1: Shell + Theme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top-navbar layout with a Robinhood-style app shell (left sidebar + top bar, dark charcoal theme, Tailwind v4 + shadcn/ui) while keeping every existing page working under `/lab/*` routes.

**Architecture:** New `layout/` components (AppShell, Sidebar, TopBar) wrap all routes via a React Router layout route. Existing pages move to `/lab/*` with redirects from their old paths so internal links and bookmarks keep working. Legacy CSS tokens are remapped to the new palette so old pages inherit the new look without edits. New beginner pages render designed "coming soon" states until Phases 2–5 fill them in.

**Tech Stack:** React 18 + Vite 5 + TypeScript (existing), Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui components, lucide-react icons, sonner toasts, @fontsource-variable/inter. Vitest + RTL for tests (existing).

**Spec:** `docs/superpowers/specs/2026-07-30-beginner-frontend-redesign-design.md` (this plan implements rollout Phase 1 only; Phases 2–5 get their own plans).

**Working directory for all commands:** `dashboard/` unless stated otherwise. All git commands run from the repo root.

---

## File map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `dashboard/package.json` | new deps (via npm install) |
| Modify | `dashboard/vite.config.ts` | tailwind plugin + `@` alias |
| Modify | `dashboard/tsconfig.json` | `@/*` path alias |
| Modify | `dashboard/tsconfig.node.json` | node types for `path` import |
| Create | `dashboard/src/styles/app.css` | Tailwind entry + theme tokens + shadcn variables |
| Modify | `dashboard/src/styles/tokens.css` | remap legacy tokens to new palette |
| Modify | `dashboard/src/styles/global.css` | Inter font for legacy pages |
| Modify | `dashboard/src/main.tsx` | import fonts + app.css |
| Create | `dashboard/components.json` | shadcn CLI config |
| Create | `dashboard/src/lib/utils.ts` (+test) | `cn()` class merger |
| Create | `dashboard/src/components/ui/*` | shadcn primitives (generated) |
| Modify | `dashboard/src/vitest.setup.ts` | jsdom stubs (matchMedia, ResizeObserver) |
| Create | `dashboard/src/layout/Sidebar.tsx` (+test) | nav: 5 beginner items, Strategy Lab group, Settings |
| Create | `dashboard/src/layout/TopBar.tsx` (+test) | logo, disabled search, bell, avatar |
| Create | `dashboard/src/layout/AppShell.tsx` (+test) | layout grid + `<Outlet/>` + Toaster |
| Create | `dashboard/src/components/ComingSoon.tsx` (+test) | designed placeholder page body |
| Create | `dashboard/src/components/RedirectWithParams.tsx` (+test) | param-preserving legacy redirects |
| Modify | `dashboard/src/App.tsx` (+new test) | new route table |
| Delete | `dashboard/src/components/NavBar.tsx` + `NavBar.test.tsx` | replaced by shell |

---

### Task 1: Tailwind v4, path alias, and the new theme

**Files:**
- Modify: `dashboard/vite.config.ts`
- Modify: `dashboard/tsconfig.json`
- Modify: `dashboard/tsconfig.node.json`
- Create: `dashboard/src/styles/app.css`
- Modify: `dashboard/src/styles/tokens.css`
- Modify: `dashboard/src/styles/global.css`
- Modify: `dashboard/src/main.tsx`

- [ ] **Step 1: Install dependencies**

```powershell
cd dashboard
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node
npm install @fontsource-variable/inter
```

Expected: packages added to `package.json` without peer-dep errors.

- [ ] **Step 2: Wire the Tailwind plugin and `@` alias into Vite**

Replace `dashboard/vite.config.ts` with:

```ts
/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/vitest.setup.ts',
  },
})
```

- [ ] **Step 3: Add the `@/*` alias to `tsconfig.json`**

In `dashboard/tsconfig.json`, add to `compilerOptions` (keep everything else):

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 4: Ensure node types for `vite.config.ts`**

Open `dashboard/tsconfig.node.json`. If `compilerOptions.types` exists, ensure it includes `"node"`; if there is no `types` entry, add `"types": ["node"]` to `compilerOptions`. (Without this, `tsc -b` fails on `import path from 'node:path'`.)

- [ ] **Step 5: Create the Tailwind entry stylesheet**

Create `dashboard/src/styles/app.css`:

```css
@import 'tailwindcss';

/* ---- Palette (spec §6): dark-only, defined on :root ---- */
:root {
  --background: #0f1117;
  --foreground: #f2f4f8;
  --card: #161925;
  --card-foreground: #f2f4f8;
  --popover: #161925;
  --popover-foreground: #f2f4f8;
  --primary: #3b82f6;
  --primary-foreground: #ffffff;
  --secondary: #1a2030;
  --secondary-foreground: #f2f4f8;
  --muted: #1a2030;
  --muted-foreground: #8b93a7;
  --accent: #1a2030;
  --accent-foreground: #f2f4f8;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: #232838;
  --input: #232838;
  --ring: #3b82f6;
  --radius: 0.875rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@theme {
  --font-sans: 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif;
  /* Semantic finance accents (spec §6) */
  --color-profit: #22c55e;
  --color-loss: #ef4444;
  --color-watch: #f59e0b;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background font-sans text-foreground;
  }
}
```

Usage note for later tasks: `text-profit`, `text-loss`, `text-watch`, plus standard shadcn semantics (`bg-card`, `text-muted-foreground`, …).

- [ ] **Step 6: Remap legacy tokens so Lab pages inherit the new look**

Replace the color values in `dashboard/src/styles/tokens.css` (spacing/text sizes unchanged):

```css
:root {
  --color-bg: #0f1117;
  --color-surface: #161925;
  --color-surface-2: #1a2030;
  --color-text: #f2f4f8;
  --color-text-muted: #8b93a7;
  --color-border: #232838;
  --color-accent: #3b82f6;
  --color-pos: #22c55e;
  --color-neg: #ef4444;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;

  --radius: 12px;
  --text-sm: 0.85rem;
  --text-base: 1rem;
  --text-lg: 1.4rem;
  --text-xl: 2rem;
}
```

- [ ] **Step 7: Point legacy body font at Inter**

In `dashboard/src/styles/global.css`, change the `body` rule's font line to:

```css
font-family: 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif;
```

- [ ] **Step 8: Import fonts and app.css in `main.tsx`**

In `dashboard/src/main.tsx`, replace the single `import './styles/global.css'` line with (order matters — layered Tailwind first, unlayered legacy CSS last so legacy rules still win on Lab pages):

```ts
import '@fontsource-variable/inter'
import './styles/app.css'
import './styles/global.css'
```

- [ ] **Step 9: Verify build and tests still pass**

```powershell
npm run build
npm test
```

Expected: `tsc -b` clean, `vite build` succeeds, all existing tests PASS (nothing imports new code yet — this proves the toolchain change is inert).

- [ ] **Step 10: Commit**

```powershell
cd ..
git add dashboard
git commit -m "feat(dashboard): add tailwind v4, path alias, and dark fintech theme tokens"
```

---

### Task 2: shadcn/ui scaffolding, primitives, and jsdom stubs

**Files:**
- Create: `dashboard/components.json`
- Create: `dashboard/src/lib/utils.ts`
- Test: `dashboard/src/lib/utils.test.ts`
- Create: `dashboard/src/components/ui/` (generated: button, card, dialog, tabs, skeleton, input, switch)
- Modify: `dashboard/src/vitest.setup.ts`

- [ ] **Step 1: Install shadcn runtime deps + sonner**

```powershell
cd dashboard
npm install class-variance-authority clsx tailwind-merge lucide-react sonner
```

- [ ] **Step 2: Write the failing test for `cn()`**

Create `dashboard/src/lib/utils.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('merges conditional classes and resolves tailwind conflicts', () => {
    expect(cn('p-2', undefined, false, 'p-4')).toBe('p-4')
    expect(cn('text-sm', 'font-bold')).toBe('text-sm font-bold')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```powershell
npx vitest run src/lib/utils.test.ts
```

Expected: FAIL — `Cannot find module './utils'`.

- [ ] **Step 4: Implement `cn()`**

Create `dashboard/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 5: Run test to verify it passes**

```powershell
npx vitest run src/lib/utils.test.ts
```

Expected: PASS (2 assertions).

- [ ] **Step 6: Create shadcn CLI config**

Create `dashboard/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/app.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 7: Generate the primitives**

```powershell
npx shadcn@latest add button card dialog tabs skeleton input switch --yes --overwrite
```

Expected: files appear under `src/components/ui/` (button.tsx, card.tsx, dialog.tsx, tabs.tsx, skeleton.tsx, input.tsx, switch.tsx) and `@radix-ui/*` deps are added automatically. If the CLI errors on registry fetch, re-run once (transient network); if it errors on the CSS file, confirm `components.json` `tailwind.css` matches `src/styles/app.css`.

**Fallback if the CLI cannot run non-interactively:** stop and report — do not hand-write approximations of all seven components silently.

- [ ] **Step 8: Add jsdom stubs needed by radix/sonner**

Append to `dashboard/src/vitest.setup.ts` (keep the existing jest-dom import and anything else already there):

```ts
// jsdom lacks these browser APIs used by radix-ui and sonner
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
```

- [ ] **Step 9: Verify build and full test suite**

```powershell
npm run build
npm test
```

Expected: build clean (generated ui files compile under `strict`), all tests PASS. If `noUnusedLocals`/`noUnusedParameters` flag anything inside generated `src/components/ui/*`, fix the specific line (e.g., prefix unused param with `_`) rather than loosening tsconfig.

- [ ] **Step 10: Commit**

```powershell
cd ..
git add dashboard
git commit -m "feat(dashboard): add shadcn primitives, cn helper, and jsdom test stubs"
```

---

### Task 3: Sidebar

**Files:**
- Create: `dashboard/src/layout/Sidebar.tsx`
- Test: `dashboard/src/layout/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/layout/Sidebar.test.tsx`:

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
    renderAt('/')
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /markets/i })).toHaveAttribute('href', '/markets')
    expect(screen.getByRole('link', { name: /portfolio/i })).toHaveAttribute('href', '/portfolio')
    expect(screen.getByRole('link', { name: /leaderboard/i })).toHaveAttribute('href', '/leaderboard')
    expect(screen.getByRole('link', { name: /news/i })).toHaveAttribute('href', '/news')
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings')
  })

  it('renders the Strategy Lab section with lab links', () => {
    renderAt('/')
    expect(screen.getByText('Strategy Lab')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /backtests/i })).toHaveAttribute('href', '/lab/backtests')
    expect(screen.getByRole('link', { name: /research/i })).toHaveAttribute('href', '/lab/research')
    expect(screen.getByRole('link', { name: /paper sessions/i })).toHaveAttribute('href', '/lab/paper')
  })

  it('marks the current section active via aria-current', () => {
    renderAt('/markets')
    expect(screen.getByRole('link', { name: /markets/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npx vitest run src/layout/Sidebar.test.tsx
```

Expected: FAIL — `Cannot find module './Sidebar'`.

- [ ] **Step 3: Implement Sidebar**

Create `dashboard/src/layout/Sidebar.tsx`:

```tsx
import { NavLink } from 'react-router-dom'
import {
  Activity,
  Bot,
  CandlestickChart,
  FlaskConical,
  LayoutDashboard,
  Newspaper,
  Settings,
  Trophy,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const MAIN_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/markets', label: 'Markets', icon: CandlestickChart },
  { to: '/portfolio', label: 'Portfolio', icon: Wallet },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/news', label: 'News', icon: Newspaper },
]

const LAB_ITEMS: NavItem[] = [
  { to: '/lab/backtests', label: 'Backtests', icon: FlaskConical },
  { to: '/lab/research', label: 'Research', icon: Bot },
  { to: '/lab/paper', label: 'Paper Sessions', icon: Activity },
]

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <nav
      aria-label="Main navigation"
      className="flex w-52 shrink-0 flex-col gap-1 border-r border-border px-3 py-4"
    >
      {MAIN_ITEMS.map((item) => (
        <SidebarLink key={item.to} item={item} />
      ))}

      <div className="mt-4 border-t border-border pt-4">
        <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          Strategy Lab
        </p>
        {LAB_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </div>

      <div className="mt-auto border-t border-border pt-4">
        <SidebarLink item={{ to: '/settings', label: 'Settings', icon: Settings }} />
      </div>
    </nav>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npx vitest run src/layout/Sidebar.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```powershell
cd ..
git add dashboard/src/layout
git commit -m "feat(dashboard): add sidebar navigation with strategy lab section"
```

---

### Task 4: TopBar

**Files:**
- Create: `dashboard/src/layout/TopBar.tsx`
- Test: `dashboard/src/layout/TopBar.test.tsx`

Phase-1 note: search, notifications, and the portfolio-value chip need backend surfaces from Phases 2–3, so this bar renders the brand, a disabled search input, a muted bell, and an avatar placeholder. No dead interactive elements — disabled means visibly disabled.

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/layout/TopBar.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopBar } from './TopBar'

describe('TopBar', () => {
  it('renders the brand', () => {
    render(<TopBar />)
    expect(screen.getByText('HedgeFund Sim')).toBeInTheDocument()
  })

  it('renders a disabled search input until markets exist', () => {
    render(<TopBar />)
    const search = screen.getByPlaceholderText(/search coins/i)
    expect(search).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npx vitest run src/layout/TopBar.test.tsx
```

Expected: FAIL — `Cannot find module './TopBar'`.

- [ ] **Step 3: Implement TopBar**

Create `dashboard/src/layout/TopBar.tsx`:

```tsx
import { Bell, Hexagon, Search, User } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <Hexagon className="size-5 text-primary" aria-hidden="true" />
        <span className="text-sm font-bold">HedgeFund Sim</span>
      </div>

      <div className="relative ml-4 hidden w-full max-w-xs md:block">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input disabled placeholder="Search coins…" className="h-9 pl-9" />
      </div>

      <div className="ml-auto flex items-center gap-4">
        <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
        <div
          aria-label="Your profile"
          className="flex size-8 items-center justify-center rounded-full bg-secondary text-muted-foreground"
        >
          <User className="size-4" aria-hidden="true" />
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npx vitest run src/layout/TopBar.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```powershell
cd ..
git add dashboard/src/layout
git commit -m "feat(dashboard): add top bar with brand and placeholder controls"
```

---

### Task 5: AppShell

**Files:**
- Create: `dashboard/src/layout/AppShell.tsx`
- Test: `dashboard/src/layout/AppShell.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/layout/AppShell.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders top bar, sidebar, and routed content', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<p>routed content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('HedgeFund Sim')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument()
    expect(screen.getByText('routed content')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npx vitest run src/layout/AppShell.test.tsx
```

Expected: FAIL — `Cannot find module './AppShell'`.

- [ ] **Step 3: Implement AppShell**

Create `dashboard/src/layout/AppShell.tsx`:

```tsx
import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden p-6">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  )
}
```

(The `max-w-6xl` wrapper preserves the width cap the legacy `.container` class used to give Lab pages.)

- [ ] **Step 4: Run test to verify it passes**

```powershell
npx vitest run src/layout/AppShell.test.tsx
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```powershell
cd ..
git add dashboard/src/layout
git commit -m "feat(dashboard): add app shell with sidebar, top bar, and toaster"
```

---

### Task 6: ComingSoon placeholder page body

**Files:**
- Create: `dashboard/src/components/ComingSoon.tsx`
- Test: `dashboard/src/components/ComingSoon.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/components/ComingSoon.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { ComingSoon } from './ComingSoon'

describe('ComingSoon', () => {
  it('renders title, description, and optional CTA link', () => {
    render(
      <MemoryRouter>
        <ComingSoon
          icon={Wallet}
          title="Portfolio"
          description="Your positions will live here."
          cta={{ to: '/lab/backtests', label: 'Explore the Strategy Lab' }}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument()
    expect(screen.getByText('Your positions will live here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /explore the strategy lab/i })).toHaveAttribute(
      'href',
      '/lab/backtests',
    )
  })

  it('renders without a CTA', () => {
    render(
      <MemoryRouter>
        <ComingSoon icon={Wallet} title="News" description="Headlines soon." />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npx vitest run src/components/ComingSoon.test.tsx
```

Expected: FAIL — `Cannot find module './ComingSoon'`.

- [ ] **Step 3: Implement ComingSoon**

Create `dashboard/src/components/ComingSoon.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

type Props = {
  icon: LucideIcon
  title: string
  description: string
  cta?: { to: string; label: string }
}

export function ComingSoon({ icon: Icon, title, description, cta }: Props) {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-card">
        <Icon className="size-7 text-primary" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {cta && (
        <Button asChild variant="outline" className="mt-2">
          <Link to={cta.to}>{cta.label}</Link>
        </Button>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npx vitest run src/components/ComingSoon.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```powershell
cd ..
git add dashboard/src/components
git commit -m "feat(dashboard): add ComingSoon placeholder page body"
```

---

### Task 7: RedirectWithParams

**Files:**
- Create: `dashboard/src/components/RedirectWithParams.tsx`
- Test: `dashboard/src/components/RedirectWithParams.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/components/RedirectWithParams.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { RedirectWithParams } from './RedirectWithParams'

function Probe() {
  const { id } = useParams()
  return <p>landed with id {id}</p>
}

describe('RedirectWithParams', () => {
  it('redirects preserving route params', () => {
    render(
      <MemoryRouter initialEntries={['/backtests/42']}>
        <Routes>
          <Route path="/backtests/:id" element={<RedirectWithParams to="/lab/backtests/:id" />} />
          <Route path="/lab/backtests/:id" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('landed with id 42')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npx vitest run src/components/RedirectWithParams.test.tsx
```

Expected: FAIL — `Cannot find module './RedirectWithParams'`.

- [ ] **Step 3: Implement RedirectWithParams**

Create `dashboard/src/components/RedirectWithParams.tsx`:

```tsx
import { Navigate, generatePath, useParams } from 'react-router-dom'

export function RedirectWithParams({ to }: { to: string }) {
  const params = useParams()
  return <Navigate to={generatePath(to, params)} replace />
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npx vitest run src/components/RedirectWithParams.test.tsx
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```powershell
cd ..
git add dashboard/src/components
git commit -m "feat(dashboard): add param-preserving redirect helper"
```

---

### Task 8: Route restructure — new App.tsx, delete NavBar

**Files:**
- Modify: `dashboard/src/App.tsx`
- Test: `dashboard/src/App.test.tsx` (new)
- Delete: `dashboard/src/components/NavBar.tsx`, `dashboard/src/components/NavBar.test.tsx`

- [ ] **Step 1: Write the failing routing test**

Create `dashboard/src/App.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'

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

describe('App routing', () => {
  beforeEach(() => {
    // Lab pages fetch on mount; a never-resolving fetch keeps them in loading state.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  })

  it('renders the Dashboard placeholder at /', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('renders placeholders for the other beginner routes', () => {
    renderAt('/markets')
    expect(screen.getByRole('heading', { name: 'Markets' })).toBeInTheDocument()
  })

  it('redirects legacy /paper to /lab/paper (Paper Sessions nav becomes active)', async () => {
    renderAt('/paper')
    expect(
      await screen.findByRole('link', { name: /paper sessions/i }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('redirects legacy /history to /lab/backtests/history (Backtests nav becomes active)', async () => {
    renderAt('/history')
    expect(
      await screen.findByRole('link', { name: /backtests/i }),
    ).toHaveAttribute('aria-current', 'page')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd dashboard
npx vitest run src/App.test.tsx
```

Expected: FAIL — current App renders NavBar/`New Run` at `/`, so the Dashboard-heading assertion fails.

- [ ] **Step 3: Rewrite App.tsx**

Replace `dashboard/src/App.tsx` with:

```tsx
import { Navigate, Route, Routes } from 'react-router-dom'
import {
  CandlestickChart,
  LayoutDashboard,
  Newspaper,
  Settings,
  Trophy,
  Wallet,
} from 'lucide-react'
import { AppShell } from './layout/AppShell'
import { ComingSoon } from './components/ComingSoon'
import { RedirectWithParams } from './components/RedirectWithParams'
import { NewRunPage } from './pages/NewRunPage'
import { HistoryPage } from './pages/HistoryPage'
import { ResultPage } from './pages/ResultPage'
import { AgentRunPage } from './pages/AgentRunPage'
import { AgentResultPage } from './pages/AgentResultPage'
import { AgentHistoryPage } from './pages/AgentHistoryPage'
import { PaperStartPage } from './pages/PaperStartPage'
import { PaperHistoryPage } from './pages/PaperHistoryPage'
import { PaperLivePage } from './pages/PaperLivePage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Beginner surfaces — placeholders until Phases 2-5 */}
        <Route
          path="/"
          element={
            <ComingSoon
              icon={LayoutDashboard}
              title="Dashboard"
              description="Your $100,000 practice portfolio is on its way. Markets and trading arrive in the next phases — the Strategy Lab is fully open in the meantime."
              cta={{ to: '/lab/backtests', label: 'Explore the Strategy Lab' }}
            />
          }
        />
        <Route
          path="/markets"
          element={
            <ComingSoon
              icon={CandlestickChart}
              title="Markets"
              description="Browse and search every tradeable coin with live prices and sparklines. Coming in Phase 2."
            />
          }
        />
        <Route
          path="/portfolio"
          element={
            <ComingSoon
              icon={Wallet}
              title="Portfolio"
              description="Your positions, orders, and activity will live here once trading opens in Phase 3."
            />
          }
        />
        <Route
          path="/leaderboard"
          element={
            <ComingSoon
              icon={Trophy}
              title="Leaderboard"
              description="You vs the AI strategies vs buy-and-hold Bitcoin. Coming in Phase 5."
            />
          }
        />
        <Route
          path="/news"
          element={
            <ComingSoon
              icon={Newspaper}
              title="News"
              description="Crypto headlines, refreshed automatically. Coming in Phase 5."
            />
          }
        />
        <Route
          path="/settings"
          element={
            <ComingSoon
              icon={Settings}
              title="Settings"
              description="Portfolio reset, starting cash, and advisor controls arrive with trading in Phase 3."
            />
          }
        />

        {/* Strategy Lab — existing pages, new addresses */}
        <Route path="/lab/backtests" element={<NewRunPage />} />
        <Route path="/lab/backtests/history" element={<HistoryPage />} />
        <Route path="/lab/backtests/:id" element={<ResultPage />} />
        <Route path="/lab/research" element={<AgentRunPage />} />
        <Route path="/lab/research/history" element={<AgentHistoryPage />} />
        <Route path="/lab/research/runs/:id" element={<AgentResultPage />} />
        <Route path="/lab/paper" element={<PaperStartPage />} />
        <Route path="/lab/paper/history" element={<PaperHistoryPage />} />
        <Route path="/lab/paper/sessions/:id" element={<PaperLivePage />} />

        {/* Legacy redirects — keep old bookmarks and in-app links working */}
        <Route path="/history" element={<Navigate to="/lab/backtests/history" replace />} />
        <Route path="/backtests/:id" element={<RedirectWithParams to="/lab/backtests/:id" />} />
        <Route path="/research" element={<Navigate to="/lab/research" replace />} />
        <Route path="/research/history" element={<Navigate to="/lab/research/history" replace />} />
        <Route path="/research/runs/:id" element={<RedirectWithParams to="/lab/research/runs/:id" />} />
        <Route path="/paper" element={<Navigate to="/lab/paper" replace />} />
        <Route path="/paper/history" element={<Navigate to="/lab/paper/history" replace />} />
        <Route path="/paper/sessions/:id" element={<RedirectWithParams to="/lab/paper/sessions/:id" />} />
      </Route>
    </Routes>
  )
}
```

Note: existing pages contain `<Link>`s to old paths (e.g. RunCard → `/backtests/:id`). The redirects make those links keep working — do NOT edit the existing pages in this phase.

- [ ] **Step 4: Delete NavBar**

```powershell
git rm dashboard/src/components/NavBar.tsx dashboard/src/components/NavBar.test.tsx
```

(Run from repo root. Nothing else imports NavBar after the App.tsx rewrite — verify with a grep for `NavBar` under `dashboard/src`; expect zero matches.)

- [ ] **Step 5: Run the App routing test**

```powershell
cd dashboard
npx vitest run src/App.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite and build**

```powershell
npm test
npm run build
```

Expected: all tests PASS (existing page tests are self-contained with MemoryRouter and unaffected by the route moves); build clean.

- [ ] **Step 7: Commit**

```powershell
cd ..
git add -A dashboard
git commit -m "feat(dashboard): robinhood-style shell with lab routes and legacy redirects"
```

---

### Task 9: Manual smoke check + phase wrap-up

**Files:** none (verification only)

- [ ] **Step 1: Run the dev server**

```powershell
cd dashboard
npm run dev
```

Open http://localhost:5173 and verify each item:

1. `/` shows the Dashboard placeholder inside the new shell (charcoal background, sidebar left, top bar with brand + disabled search).
2. Sidebar: Dashboard, Markets, Portfolio, Leaderboard, News navigate to placeholders; Strategy Lab section shows Backtests / Research / Paper Sessions; Settings pinned at bottom.
3. `/lab/backtests` renders the existing spec form, restyled by the token remap (dark charcoal, blue accent) — functional as before.
4. `/lab/paper` and `/lab/research` render their existing pages.
5. Old URLs redirect: `/history`, `/paper`, `/research` land on the `/lab/*` equivalents with the correct sidebar item highlighted.
6. Fonts render as Inter (inspect any heading → computed font-family starts with "Inter Variable").
7. No console errors on any visited route.

- [ ] **Step 2: Fix anything found, re-run `npm test` and `npm run build`, commit fixes**

```powershell
git add -A dashboard
git commit -m "fix(dashboard): phase 1 smoke-check fixes"
```

(Skip the commit if the working tree is clean.)

- [ ] **Step 3: Done — hand off**

Phase 1 exit criteria (all must hold):
- All previous functionality reachable under Strategy Lab.
- New shell present on every route; placeholders for beginner pages.
- Full test suite green; production build green.

Next: plan Phase 2 (Markets — market-data endpoints, Markets page, Trade view with chart + Pro toggle, watchlist) as a separate plan document.
