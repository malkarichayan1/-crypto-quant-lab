import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { getAssetCandles, getMarketAssets } from '../api/market'
import { getPortfolio } from '../api/portfolio'
import { useWatchlist } from '../hooks/useWatchlist'
import { AdvisorCard } from '../components/AdvisorCard'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { CoinIcon } from '../components/CoinIcon'
import { OrderTicket } from '../components/OrderTicket'
import { PriceChart } from '../components/PriceChart'
import { StalePricesBanner } from '../components/StalePricesBanner'
import { formatPct, formatUsd } from '../lib/format'
import type { TimeRange } from '../types'

const RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', '1Y']
const POLL_INTERVAL_MS = 30_000

export function AssetPage() {
  const { symbol: rawSymbol } = useParams()
  const symbol = (rawSymbol ?? '').toUpperCase()
  const [range, setRange] = useState<TimeRange>('1D')
  const [isProView, setIsProView] = useState(false)
  const { starred, toggle } = useWatchlist()

  const assetsQuery = useQuery({
    queryKey: ['market-assets'],
    queryFn: getMarketAssets,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const quote = assetsQuery.data?.assets.find((a) => a.symbol === symbol)
  // Once assets have loaded at least once, we know whether `symbol` is a
  // real coin. If it isn't, stop fetching/polling candles for it — the
  // backend 404s deterministically and there's nothing to recover.
  const candlesQuery = useQuery({
    queryKey: ['asset-candles', symbol, range],
    queryFn: () => getAssetCandles(symbol, range),
    enabled: symbol.length > 0 && (assetsQuery.data === undefined || Boolean(quote)),
    refetchInterval: POLL_INTERVAL_MS,
  })
  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const position = portfolioQuery.data?.positions.find((p) => p.symbol === symbol)

  // No data at all (first load failed, no cache to fall back on) — show a
  // full-page error with retry. A background refetch failure once we already
  // have data is handled silently below (existing content just keeps showing).
  if (assetsQuery.isError && !assetsQuery.data) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          We couldn't load this coin's data.
        </p>
        <Button variant="outline" onClick={() => assetsQuery.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (assetsQuery.isSuccess && !quote) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-muted-foreground">
          We couldn't find that coin.
        </p>
        <Button asChild variant="outline">
          <Link to="/app/markets">Back to Markets</Link>
        </Button>
      </div>
    )
  }

  const isPositive = (quote?.change_24h_pct ?? 0) >= 0
  const isStarred = starred.has(symbol)

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/app' },
          { label: 'Markets', to: '/app/markets' },
          { label: symbol },
        ]}
      />
      {(assetsQuery.data?.stale || candlesQuery.data?.stale) && <StalePricesBanner />}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CoinIcon symbol={symbol} className="size-11" />
          <div>
            {quote ? (
              <p className="text-lg font-semibold">{quote.name}</p>
            ) : (
              <Skeleton className="h-6 w-28" />
            )}
            <p className="text-xs text-muted-foreground">{symbol}</p>
          </div>
          <button
            type="button"
            aria-label={
              isStarred
                ? `Remove ${symbol} from watchlist`
                : `Add ${symbol} to watchlist`
            }
            onClick={() => toggle(symbol)}
            className="rounded-md p-1.5 transition-colors duration-200 hover:bg-accent"
          >
            <Star
              className={cn(
                'size-5',
                isStarred ? 'fill-watch text-watch' : 'text-muted-foreground',
              )}
              aria-hidden="true"
            />
          </button>
        </div>
        <div className="text-right">
          {quote ? (
            <>
              <p className="text-3xl font-bold tabular-nums">{formatUsd(quote.price)}</p>
              <p
                className={cn(
                  'text-sm tabular-nums',
                  isPositive ? 'text-profit' : 'text-loss',
                )}
              >
                {formatPct(quote.change_24h_pct)} today
              </p>
            </>
          ) : (
            <Skeleton className="h-10 w-40" />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200',
                    range === r
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Pro view
              <Switch
                aria-label="Pro view"
                checked={isProView}
                onCheckedChange={setIsProView}
              />
            </label>
          </div>

          {candlesQuery.isLoading ? (
            <Skeleton className="h-[360px] w-full rounded-xl" />
          ) : candlesQuery.isError && !candlesQuery.data ? (
            <div className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-xl border border-border text-center">
              <p className="text-sm text-muted-foreground">
                We couldn't load the chart.
              </p>
              <Button variant="outline" size="sm" onClick={() => candlesQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <PriceChart
              candles={candlesQuery.data?.candles ?? []}
              mode={isProView ? 'pro' : 'line'}
            />
          )}

          <div className="mt-4 grid grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">24h high</p>
                <p className="mt-1 text-sm font-medium tabular-nums">
                  {quote ? formatUsd(quote.high_24h) : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">24h low</p>
                <p className="mt-1 text-sm font-medium tabular-nums">
                  {quote ? formatUsd(quote.low_24h) : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">24h volume</p>
                <p className="mt-1 text-sm font-medium tabular-nums">
                  {quote ? formatUsd(quote.volume_24h) : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">You own</p>
                <p className="mt-1 text-sm font-medium tabular-nums">
                  {portfolioQuery.data ? formatUsd(position?.market_value ?? 0) : '—'}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {quote && portfolioQuery.data ? (
            <OrderTicket
              symbol={symbol}
              price={quote.price}
              cash={portfolioQuery.data.cash}
              heldUnits={position?.units ?? 0}
            />
          ) : portfolioQuery.isError && !portfolioQuery.data ? (
            <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-xl border border-border text-center">
              <p className="text-sm text-muted-foreground">
                We couldn't load your portfolio.
              </p>
              <Button variant="outline" size="sm" onClick={() => portfolioQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <Skeleton className="h-72 w-full rounded-xl" />
          )}

          <AdvisorCard symbol={symbol} />
        </div>
      </div>
    </div>
  )
}
