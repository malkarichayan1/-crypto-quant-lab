import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getPortfolio } from '../api/portfolio'
import { formatUsd } from '../lib/format'
import { cn } from '@/lib/utils'

/**
 * Compact equity + today's P/L glance, pinned above Settings in the
 * sidebar footer. Shares the ['portfolio'] query key with DashboardPage/
 * PortfolioPage/TopBar, so on most navigations this reads from cache
 * instead of firing a new request.
 *
 * Deliberately quiet on failure: this is a bonus glance, not the primary
 * portfolio view, so an error here just hides the card rather than
 * surfacing an alarming message in permanent chrome. The full error state
 * still lives on the actual Portfolio page.
 */
export function PortfolioSummaryCard() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
  })

  if (isError) return null

  if (isPending) {
    return (
      <div className="rounded-lg border border-border px-3 py-2.5" aria-hidden="true">
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-5 w-24 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  const isProfit = data.today_pl >= 0

  return (
    <Link
      to="/app/portfolio"
      className="block rounded-lg border border-border px-3 py-2.5 transition-colors duration-200 hover:bg-accent"
    >
      <p className="text-xs text-muted-foreground">Portfolio value</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{formatUsd(data.equity)}</p>
      <p
        className={cn(
          'mt-0.5 text-xs tabular-nums',
          isProfit ? 'text-profit' : 'text-loss',
        )}
      >
        {isProfit ? '+' : ''}
        {formatUsd(data.today_pl)} today
      </p>
    </Link>
  )
}
