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
 * A third generation was added on 2026-08-17 when Strategy Lab itself
 * (Backtests/Research/Paper Sessions) was removed for being too advanced
 * for the app's beginner audience — every `/app/lab/*` path that was live
 * in production, plus everything above that used to point there, now
 * redirects straight to `/app` (the Dashboard) instead of 404ing.
 */
export const STATIC_REDIRECTS: Record<string, string> = {
  '/markets': '/app/markets',
  '/portfolio': '/app/portfolio',
  '/leaderboard': '/app/leaderboard',
  '/news': '/app/news',
  '/settings': '/app/settings',
  '/lab/backtests': '/app',
  '/lab/backtests/history': '/app',
  '/lab/research': '/app',
  '/lab/research/history': '/app',
  '/lab/paper': '/app',
  '/lab/paper/history': '/app',
  '/history': '/app',
  '/research': '/app',
  '/research/history': '/app',
  '/paper/history': '/app',
  '/paper': '/app',
  '/app/lab/backtests': '/app',
  '/app/lab/backtests/history': '/app',
  '/app/lab/research': '/app',
  '/app/lab/research/history': '/app',
  '/app/lab/paper': '/app',
  '/app/lab/paper/history': '/app',
}

export const PARAM_REDIRECTS: Array<{ from: string; to: string }> = [
  { from: '/coins/:symbol', to: '/app/coins/:symbol' },
  { from: '/lab/backtests/:id', to: '/app' },
  { from: '/lab/research/runs/:id', to: '/app' },
  { from: '/lab/paper/sessions/:id', to: '/app' },
  { from: '/backtests/:id', to: '/app' },
  { from: '/research/runs/:id', to: '/app' },
  { from: '/paper/sessions/:id', to: '/app' },
  { from: '/app/lab/backtests/:id', to: '/app' },
  { from: '/app/lab/research/runs/:id', to: '/app' },
  { from: '/app/lab/paper/sessions/:id', to: '/app' },
]
