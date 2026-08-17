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
]

export const FALLBACK_PAGE_META: PageMetaEntry = {
  pattern: '*',
  title: 'HedgeFund Simulator',
  description: 'A free crypto paper-trading simulator for beginners.',
}
