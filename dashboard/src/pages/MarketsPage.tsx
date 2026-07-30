import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getMarketAssets } from '../api/market'
import { useWatchlist } from '../hooks/useWatchlist'
import { AssetRow } from '../components/AssetRow'
import { StalePricesBanner } from '../components/StalePricesBanner'

const POLL_INTERVAL_MS = 30_000
const SKELETON_ROWS = 8

export function MarketsPage() {
  const [query, setQuery] = useState('')
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['market-assets'],
    queryFn: getMarketAssets,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const { starred, toggle } = useWatchlist()

  const normalized = query.trim().toLowerCase()
  const filtered = (data?.assets ?? []).filter(
    (asset) =>
      asset.symbol.toLowerCase().includes(normalized) ||
      asset.name.toLowerCase().includes(normalized),
  )
  // Stable sort: starred first, API (universe) order within each group.
  const rows = [...filtered].sort(
    (a, b) => Number(starred.has(b.symbol)) - Number(starred.has(a.symbol)),
  )

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Markets</h1>
        <div className="relative w-full max-w-xs">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Search coins…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-9"
          />
        </div>
      </div>

      {data?.stale && <StalePricesBanner />}

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            We couldn't load market data.
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="flex flex-col gap-1">
          {rows.map((asset) => (
            <AssetRow
              key={asset.symbol}
              asset={asset}
              isStarred={starred.has(asset.symbol)}
              onToggleStar={toggle}
            />
          ))}
          {rows.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No coins match "{query}".
            </p>
          )}
        </div>
      )}
    </div>
  )
}
