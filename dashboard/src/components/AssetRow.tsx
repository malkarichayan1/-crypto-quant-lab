import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPct, formatUsd } from '../lib/format'
import { CoinIcon } from './CoinIcon'
import { Sparkline } from './Sparkline'
import type { AssetQuote } from '../types'

type Props = {
  asset: AssetQuote
  isStarred: boolean
  onToggleStar: (symbol: string) => void
}

export function AssetRow({ asset, isStarred, onToggleStar }: Props) {
  const isPositive = asset.change_24h_pct >= 0
  return (
    <Link
      to={`/coins/${asset.symbol}`}
      className="flex items-center gap-4 rounded-xl border border-transparent px-3 py-2.5 transition-colors duration-200 hover:border-border hover:bg-card"
    >
      <CoinIcon symbol={asset.symbol} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{asset.name}</p>
        <p className="text-xs text-muted-foreground">{asset.symbol}</p>
      </div>
      <div className="hidden sm:block">
        <Sparkline data={asset.sparkline} isPositive={isPositive} />
      </div>
      <div className="w-28 text-right">
        <p className="text-sm font-medium tabular-nums">{formatUsd(asset.price)}</p>
        <p
          className={cn(
            'text-xs tabular-nums',
            isPositive ? 'text-profit' : 'text-loss',
          )}
        >
          {formatPct(asset.change_24h_pct)}
        </p>
      </div>
      <button
        type="button"
        aria-label={
          isStarred
            ? `Remove ${asset.symbol} from watchlist`
            : `Add ${asset.symbol} to watchlist`
        }
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onToggleStar(asset.symbol)
        }}
        className="rounded-md p-1.5 transition-colors duration-200 hover:bg-accent"
      >
        <Star
          className={cn(
            'size-4',
            isStarred ? 'fill-watch text-watch' : 'text-muted-foreground',
          )}
          aria-hidden="true"
        />
      </button>
    </Link>
  )
}
