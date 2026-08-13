import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, Hexagon, Search, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { getMarketAssets } from '../api/market'
import { getPortfolio } from '../api/portfolio'
import { CoinIcon } from '../components/CoinIcon'
import { formatUsd } from '../lib/format'

const MAX_RESULTS = 5

export function TopBar() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const formRef = useRef<HTMLFormElement>(null)
  const { data } = useQuery({ queryKey: ['market-assets'], queryFn: getMarketAssets })
  // No refetchInterval here: TopBar is mounted once at the AppShell level
  // and never unmounts, so its own interval would run out of phase with
  // whichever trading page's ['portfolio'] query is also active, doubling
  // request volume on that shared key for as long as both are mounted. The
  // chip still gets fresh data for free the moment any page-level query
  // (same key, shared cache) refetches; staying briefly stale on
  // non-trading pages is an acceptable trade for a secondary nav widget.
  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
  })
  const portfolio = portfolioQuery.data

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
  const isOpen = matches.length > 0

  const select = (symbol: string) => {
    setQuery('')
    navigate(`/app/coins/${symbol}`)
  }

  // TopBar is mounted once at the AppShell level, outside the <Outlet> that
  // swaps per route, so it is never remounted on navigation. Without this,
  // stale results from a search stay rendered over whatever page comes next
  // when the user navigates away some other way (e.g. a Sidebar link).
  useEffect(() => {
    setQuery('')
  }, [location.pathname])

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        setQuery('')
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <Hexagon className="size-5 text-primary" aria-hidden="true" />
        <span className="text-sm font-bold">HedgeFund Sim</span>
      </div>

      <form
        ref={formRef}
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
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('')
          }}
          aria-expanded={isOpen}
          className="h-9 pl-9"
        />
        {isOpen && (
          <div
            role="listbox"
            aria-label="Search results"
            className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
          >
            {matches.map((asset) => (
              <button
                key={asset.symbol}
                type="button"
                role="option"
                aria-selected={false}
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
        {portfolio && (
          <Link
            to="/app/portfolio"
            className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 outline-none transition-colors duration-200 hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:flex"
          >
            <span className="text-xs font-medium tabular-nums">
              {formatUsd(portfolio.equity)}
            </span>
            <span
              className={cn(
                'text-xs tabular-nums',
                portfolio.today_pl >= 0 ? 'text-profit' : 'text-loss',
              )}
            >
              {portfolio.today_pl >= 0 ? '+' : ''}
              {formatUsd(portfolio.today_pl)}
            </span>
          </Link>
        )}
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
