import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, Hexagon, Search, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { getMarketAssets } from '../api/market'
import { CoinIcon } from '../components/CoinIcon'
import { formatUsd } from '../lib/format'

const MAX_RESULTS = 5

export function TopBar() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { data } = useQuery({ queryKey: ['market-assets'], queryFn: getMarketAssets })

  const normalized = query.trim().toLowerCase()
  const matches = normalized
    ? (data?.assets ?? [])
        .filter(
          (asset) =>
            asset.symbol.toLowerCase().includes(normalized) ||
            asset.name.toLowerCase().includes(normalized),
        )
        .slice(0, MAX_RESULTS)
    : []

  const select = (symbol: string) => {
    setQuery('')
    navigate(`/coins/${symbol}`)
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <Hexagon className="size-5 text-primary" aria-hidden="true" />
        <span className="text-sm font-bold">HedgeFund Sim</span>
      </div>

      <form
        className="relative ml-4 hidden w-full max-w-xs md:block"
        onSubmit={(event) => {
          event.preventDefault()
          if (matches.length > 0) select(matches[0].symbol)
        }}
      >
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="global-search"
          name="search"
          autoComplete="off"
          placeholder="Search coins…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 pl-9"
        />
        {matches.length > 0 && (
          <div
            aria-label="Search results"
            className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
          >
            {matches.map((asset) => (
              <button
                key={asset.symbol}
                type="button"
                onClick={() => select(asset.symbol)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-200 hover:bg-accent"
              >
                <CoinIcon symbol={asset.symbol} className="size-7 text-[10px]" />
                <span className="flex-1 truncate text-sm">{asset.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatUsd(asset.price)}
                </span>
              </button>
            ))}
          </div>
        )}
      </form>

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
