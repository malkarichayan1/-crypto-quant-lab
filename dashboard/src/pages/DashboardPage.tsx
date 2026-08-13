import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getMarketAssets } from '../api/market'
import { getPortfolio, getPortfolioEquity } from '../api/portfolio'
import { useWatchlist } from '../hooks/useWatchlist'
import { AdvisorCard } from '../components/AdvisorCard'
import { CoinIcon } from '../components/CoinIcon'
import { MarketCard } from '../components/MarketCard'
import { PortfolioEquityChart } from '../components/PortfolioEquityChart'
import { StalePricesBanner } from '../components/StalePricesBanner'
import { StatCard } from '../components/StatCard'
import { formatPct, formatUsd } from '../lib/format'
import type { EquityRange } from '../types'

const POLL_INTERVAL_MS = 30_000
const OVERVIEW_COUNT = 4

export function DashboardPage() {
  const [range, setRange] = useState<EquityRange>('1M')
  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const equityQuery = useQuery({
    queryKey: ['portfolio', 'equity', range],
    queryFn: () => getPortfolioEquity(range),
    refetchInterval: POLL_INTERVAL_MS,
    // Keep the previous range's chart (and its own range buttons) mounted
    // while a newly-selected range is still loading, instead of the whole
    // chart unmounting to a bare skeleton with no buttons to click back.
    placeholderData: keepPreviousData,
  })
  const marketQuery = useQuery({
    queryKey: ['market-assets'],
    queryFn: getMarketAssets,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const { starred } = useWatchlist()

  const portfolio = portfolioQuery.data
  const assets = marketQuery.data?.assets ?? []
  const watchlistAssets = assets.filter((asset) => starred.has(asset.symbol))
  const portfolioFailed = portfolioQuery.isError && !portfolioQuery.data

  return (
    <div>
      <h1 className="sr-only">Dashboard</h1>
      {portfolio?.stale && <StalePricesBanner />}

      {portfolioFailed ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            We couldn't load your portfolio.
          </p>
          <Button variant="outline" size="sm" onClick={() => portfolioQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : portfolio ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Portfolio Value" value={formatUsd(portfolio.equity)} />
          <StatCard
            label="Today's P/L"
            value={formatUsd(portfolio.today_pl)}
            tone={portfolio.today_pl >= 0 ? 'profit' : 'loss'}
          />
          <StatCard
            label="Total Return"
            value={formatPct(portfolio.total_return_pct)}
            tone={portfolio.total_return_pct >= 0 ? 'profit' : 'loss'}
          />
          <StatCard label="Buying Power" value={formatUsd(portfolio.cash)} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="p-4">
              {equityQuery.data ? (
                <PortfolioEquityChart
                  points={equityQuery.data.points}
                  range={range}
                  onRangeChange={setRange}
                />
              ) : (
                <Skeleton className="h-64 w-full" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your coins</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 p-3 pt-0">
              {portfolioFailed && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  We couldn't load your holdings.
                </p>
              )}
              {!portfolioFailed && portfolio && portfolio.positions.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  You don't own any coins yet —{' '}
                  <Link to="/app/markets" className="text-primary hover:underline">
                    explore Markets
                  </Link>
                  .
                </p>
              )}
              {!portfolioFailed &&
                portfolio?.positions.map((p) => (
                  <Link
                    key={p.symbol}
                    to={`/app/coins/${p.symbol}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-accent"
                  >
                    <CoinIcon symbol={p.symbol} className="size-8 text-[10px]" />
                    <span className="flex-1 text-sm font-medium">{p.symbol}</span>
                    <span className="text-sm tabular-nums">{formatUsd(p.market_value)}</span>
                    <span
                      className={cn(
                        'w-20 text-right text-xs tabular-nums',
                        p.unrealized_pl >= 0 ? 'text-profit' : 'text-loss',
                      )}
                    >
                      {formatPct(p.unrealized_pl_pct)}
                    </span>
                  </Link>
                ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <AdvisorCard />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Watchlist</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 p-3 pt-0">
              {watchlistAssets.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Star coins in Markets to track them here.
                </p>
              )}
              {watchlistAssets.map((asset) => (
                <Link
                  key={asset.symbol}
                  to={`/app/coins/${asset.symbol}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-accent"
                >
                  <CoinIcon symbol={asset.symbol} className="size-7 text-[10px]" />
                  <span className="flex-1 truncate text-sm">{asset.name}</span>
                  <span className="text-xs tabular-nums">{formatUsd(asset.price)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              Market overview
            </h2>
            <div className="flex flex-col gap-2">
              {assets.slice(0, OVERVIEW_COUNT).map((asset) => (
                <MarketCard key={asset.symbol} asset={asset} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
