# Surface E: Beginner-Friendly Frontend Redesign — Design Spec

**Date:** 2026-07-30
**Project:** AI Crypto Hedge Fund Simulator
**Slice:** Surface E — Robinhood-style beginner experience with manual trading + AI advice

---

## 1. Purpose

Turn the dashboard from a power-user research tool into a beginner-friendly,
Robinhood-style paper trading app. Beginners get a "black-box" environment: they
see coins, tap Buy/Sell with virtual dollars, and receive plain-English AI advice
grounded in the existing indicator engine — without ever seeing a StrategySpec,
a backtest form, or an indicator parameter unless they go looking.

The visual bar is a premium fintech product (Robinhood / Linear / Stripe
Dashboard quality): dark charcoal theme, glassy cards, smooth 200ms motion,
generous spacing.

### Design goals

- Premium, professional, fast, minimal, trustworthy.
- Never overwhelm: progressive disclosure everywhere (Pro toggle, Strategy Lab).
- All existing functionality survives, tucked into a "Strategy Lab" area.

---

## 2. Decisions made during brainstorming

| Question | Decision |
|---|---|
| Trading model | **Manual trading + AI advice.** User taps Buy/Sell; an AI advisor suggests trades with one-tap accept. Existing automated strategy engine remains available in the Lab. |
| Existing power-user pages | **Tucked into "Strategy Lab"** sidebar section under `/lab/*` routes; light reskin via shared tokens only. |
| Asset universe | **Crypto only** (existing ccxt universe). No stocks, no dividends. Market Overview shows top coins, not S&P/Nasdaq. |
| AI advice mechanism | **Signals + LLM explainer.** Indicator engine computes concrete signals; LLM turns them into 2–3 friendly suggestions. Template-text fallback if LLM fails. |
| Chart complexity | **Line chart by default, "Pro view" toggle** reveals candlesticks + volume + preset SMA/RSI. Limit orders unlock in Pro view. **No drawing tools.** |
| Leaderboard | **"You vs the AI"** — single-user app, so ranking is your portfolio vs AI paper sessions vs buy-and-hold BTC. |
| News | **Included** via free crypto RSS, fetched and cached server-side. |
| Onboarding tour / keyboard shortcuts | **Cut** from this slice. |
| Component stack | **Tailwind CSS v4 + shadcn/ui**, lucide-react icons, lightweight-charts. |
| Rollout | **Incremental** — five shippable phases, no big-bang rewrite. |

---

## 3. Success criteria

- A first-time user can open the app, understand their $100k portfolio at a
  glance, find a coin, and complete a buy in under a minute with no instructions.
- Advisor cards render grounded suggestions with a one-tap trade action and a
  "why" expansion; if the LLM is unavailable the card still renders template text.
- All existing pages (backtests, research, paper sessions) remain reachable and
  functional under Strategy Lab throughout every phase.
- Each rollout phase leaves the app fully working and shippable.
- Order math (fills, cash, positions, P/L) is covered by dense pytest units;
  frontend components hold the existing 80% coverage bar.
- No real-money trading anywhere; advice UI always carries a "simulated learning
  advice — not financial advice" disclaimer.

---

## 4. Scope

### In scope

- New app shell (sidebar + top bar) wrapping ALL routes, dark charcoal theme.
- New pages: Dashboard, Markets, Asset/Trade view, Portfolio, Leaderboard, News,
  Settings.
- New backend package `src/hedgefund/manual/` + routes: market data, manual
  portfolio/orders, watchlist, advice, news, leaderboard.
- Four new DB tables + one cache/log table (Alembic migrations).
- Tailwind v4 + shadcn/ui adoption for new surfaces; token-level reskin of old
  pages.

### Explicitly out of scope

- Real-money or real-exchange order submission (simulated fills only).
- Multi-user / authentication (single-user, like the rest of the app).
- Stocks/equities data providers.
- Drawing tools, indicator picker beyond the SMA/RSI presets.
- Websocket price streaming (polling only, ~30s).
- Onboarding tour, keyboard shortcuts, mobile-first layout (desktop-first,
  responsive down to tablet).
- Editing/altering the existing backtest/research/paper functionality.

---

## 5. Product structure & navigation

### Sidebar (7 items — consolidated from the 9 in the original brief)

1. **Dashboard** — home. Hero row of four stat cards (Portfolio Value, Today's
   P/L, Total Return %, Buying Power), portfolio equity chart, "Your coins"
   holdings list, AI Advisor card (2–3 suggestions), Watchlist widget, Market
   Overview cards (top universe coins).
2. **Markets** — Robinhood-style scrollable coin list: icon, name, price, daily
   %, sparkline. Starred coins pinned on top (**this is the watchlist** — no
   separate page). Search filters the list.
3. **Portfolio** — tabs: **Positions** (symbol, units, avg cost, current price,
   market value, unrealized P/L, today's change — sortable), **Orders** (order
   history), **Activity** (timeline cards: buys, sells, advice taken, new highs).
4. **Leaderboard** — "You vs the AI" table: your manual portfolio, each AI paper
   session, buy-and-hold BTC benchmark. Total return % since each participant's
   start date (start dates shown; no false precision about comparability).
5. **News** — headline cards: title, source, age, link out.
6. **Strategy Lab** *(divider-separated, muted styling)* — links to `/lab/backtests`
   (new run + history + results), `/lab/research` (agent runs), `/lab/paper`
   (strategy paper sessions). Existing pages mounted as-is.
7. **Settings** — reset portfolio (with confirmation dialog), starting cash for
   next reset, advisor on/off.

### Top bar

Logo, coin search (autocomplete → Trade view), portfolio value + today's P/L
chip (always visible), notifications bell (order fills), avatar placeholder.

### Trade view (`/coins/:symbol`)

- Header: coin icon/name/symbol, watchlist star, big price + daily change.
- Chart: lightweight-charts line (area gradient) with timeframe pills
  (1D 1W 1M 3M 1Y). **Pro view** switch swaps to candlesticks + volume +
  SMA-20 + RSI panes.
- Stats row: 24h high/low, 24h volume, "You own".
- **Order ticket** (right panel): Buy/Sell segmented toggle, dollar amount input
  with quick-amount chips ($50/$100/$500/Max), estimated units, buying power
  after, big accent CTA opening a **Review order** confirmation dialog.
  Market orders only; a Limit option appears when Pro view is on.
- **Advisor's take** card for this coin, with disclaimer.

---

## 6. Visual design

- **Background:** matte charcoal `#0F1117`; cards `#161925` at ~80% opacity with
  `backdrop-blur`, 1px `#232838` borders, 14–20px radius, soft shadows.
- **Accents:** emerald `#22C55E` (profit/buy), crimson `#EF4444` (loss/sell),
  electric blue `#3B82F6` (highlights, advisor), amber `#F59E0B` (watchlist).
- **Type:** Inter (self-hosted, weights 400/500/600/700), `font-display: swap`.
- **Motion:** 200ms ease transitions on hover/press/page; compositor-friendly
  properties only (transform/opacity). Subtle scale on primary buttons.
- **States:** skeleton shimmer loaders on every data surface, designed empty
  states, sonner toasts for order fills, WCAG AA contrast throughout.
- Tokens defined once as Tailwind theme variables; the legacy `tokens.css`
  values are remapped to the same palette so Lab pages inherit the look.

---

## 7. Backend design

New package `src/hedgefund/manual/` (service + advice modules) plus route
modules, reusing the existing ccxt fetch layer, indicator engine, ticker, and
SQLAlchemy/Alembic setup. **No changes to existing backtest/paper behavior.**

### Tables

- `portfolios` — id, starting_cash, created_at. Reset inserts a new row; the
  newest row is the active portfolio (history preserved).
- `manual_orders` — portfolio_id, symbol, side (`buy`/`sell`), usd_amount,
  units, fill_price, created_at. Cash and positions are always **derived** from
  orders — no mutable balance column to drift.
- `portfolio_equity` — portfolio_id, ts, equity. Snapshotted hourly by the
  existing shared ticker loop; the "now" point is computed on request from
  latest quotes.
- `watchlist` — symbol, starred_at.
- `advice_log` — portfolio_id, generated_at, payload JSON. Doubles as the
  advice cache.

### Endpoints

| Route | Behavior |
|---|---|
| `GET /market/assets` | Universe coins with latest price, 24h change, sparkline series. ccxt behind a short TTL cache (~30–60s). |
| `GET /market/assets/{symbol}/candles?range=` | OHLCV for the Trade view chart (line + Pro views). |
| `GET /portfolio` | Cash, positions (units, avg cost, market value, unrealized P/L, today's change), totals. |
| `GET /portfolio/equity?range=` | Equity curve from snapshots + live point. |
| `POST /portfolio/orders` | `{symbol, side, usd_amount}` → validate buying power / holdings → fill at latest cached price → 201 with order. Friendly 4xx messages for insufficient funds/holdings. |
| `POST /portfolio/reset` | Insert new `portfolios` row with configured starting cash. |
| `PUT/DELETE /watchlist/{symbol}` | Star/unstar. |
| `GET /advice` | Advisor pipeline (below). |
| `GET /news` | Server-fetched free crypto RSS (CoinDesk/CoinTelegraph), cached ~10 min, no API key. Returns title/source/url/published_at. |
| `GET /leaderboard` | Rows for the manual portfolio, each AI paper session, and a computed buy-and-hold-BTC benchmark: label, start date, total return %, sparkline. |

### Advisor pipeline (`GET /advice`)

1. Indicator engine computes concrete per-coin signals (SMA cross, momentum,
   RSI zones) over recent candles.
2. Portfolio context added: concentration %, idle cash %, recent P/L.
3. Compact structured summary → the LLM already configured for the research
   agent → 2–3 suggestions, each `{text, why, action?: {side, symbol,
   usd_amount}}`.
4. Result cached in `advice_log` (~15 min TTL, busted when an order fills).
5. **LLM failure → deterministic template text from the same signals** — the
   card never breaks and never blocks on the LLM.

Every advice payload includes the disclaimer string rendered by all advice UI.

### Prices

No websockets. TanStack Query polls the cached quote endpoints every ~30s
(the pattern the paper pages already use). If a ccxt fetch fails, endpoints
serve the last cached values with a `stale: true` flag; the UI shows a subtle
"prices delayed" banner instead of an error page.

---

## 8. Frontend architecture

### Stack

Tailwind CSS v4 + shadcn/ui (Button, Card, Dialog, Tabs, Skeleton, Input,
Switch, Sonner), `lucide-react`, `lightweight-charts` for the Trade chart.
Existing `recharts` stays for sparklines/equity curves; TanStack Query and the
API client module stay as-is.

### Structure

```
dashboard/src/
├── layout/        AppShell, Sidebar, TopBar (wrap ALL routes)
├── components/
│   ├── ui/        shadcn primitives
│   ├── StatCard, AssetRow, Sparkline, OrderTicket, AdvisorCard,
│   │   MarketCard, ActivityItem, PriceChart (lightweight-charts wrapper)
│   └── (existing components untouched — Lab pages keep using them)
├── pages/
│   ├── DashboardPage, MarketsPage, AssetPage, PortfolioPage,
│   │   LeaderboardPage, NewsPage, SettingsPage
│   └── lab/       existing pages re-exported under /lab/* routes
└── api/           existing client + market.ts, portfolio.ts, advice.ts, news.ts
```

- The old top `NavBar` is deleted; `AppShell` owns navigation.
- Route moves: `/` → DashboardPage; old pages move to `/lab/backtests`,
  `/lab/backtests/history`, `/lab/backtests/:id`, `/lab/research`,
  `/lab/research/*`, `/lab/paper`, `/lab/paper/*`.
- Lab pages keep global-CSS styling but inherit remapped token values.

### Cross-cutting UX

Skeletons on all data surfaces; Review-order Dialog before any fill; toast on
fill ("Bought $250 of BTC ✓") that links to Portfolio; designed empty states
("You don't own any coins yet — explore Markets"); order-ticket validation
errors shown inline in the ticket, not as toasts.

---

## 9. Rollout phases (each independently shippable)

1. **Shell + theme** — Tailwind/shadcn install; AppShell/Sidebar/TopBar; route
   restructure with Lab mounts; token remap. All existing features intact.
2. **Markets** — market-data endpoints; Markets page; Trade view with chart +
   Pro toggle (read-only); watchlist.
3. **Trading** — portfolio tables/endpoints; OrderTicket + Review dialog;
   Portfolio page; real Dashboard (stat cards, equity chart, holdings).
4. **Advisor** — signals + LLM pipeline; AdvisorCards on Dashboard and Trade
   view with one-tap accept.
5. **Leaderboard + News + Settings** — remaining pages and a final polish pass.

---

## 10. Error handling

- Exchange fetch failure → stale cache + "prices delayed" banner; never a
  broken page.
- LLM failure → template-text advice fallback (no user-visible error).
- News fetch failure → last cached items, or a designed empty state.
- Order validation failures → 4xx with friendly message, rendered inline in the
  ticket.
- Server errors → existing error envelope; pages show retry affordances.

## 11. Testing

- **Backend (pytest):** dense unit coverage on order fills, cash/position
  derivation, P/L math, advice signal generation and fallback, leaderboard
  return computation; route tests with mocked ccxt/LLM/RSS. 80%+ on
  `hedgefund/manual/` and new routes.
- **Frontend (Vitest + RTL):** per-component and per-page tests following the
  existing pattern (`*.test.tsx` beside source), 80% bar maintained. The
  lightweight-charts wrapper is tested behind a mock (canvas-free).
- Backtest/paper equivalence tests continue to pass untouched.

## 12. Risks / notes

- **Two styling idioms** (Tailwind new pages, global CSS Lab pages) until a
  future Lab migration — accepted trade-off; the Lab is the "back room."
- **Advice quality** depends on signal breadth; starting set is SMA cross,
  momentum, RSI — extending is additive.
- **Leaderboard comparability** across different start dates is imperfect;
  mitigated by displaying start dates rather than hiding them.
- lightweight-charts is canvas-based: keep it isolated in `PriceChart` so
  jsdom tests never touch canvas internals.
