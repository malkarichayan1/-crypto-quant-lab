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
