import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPct, formatUnits, formatUsd } from '../lib/format'
import { CoinIcon } from './CoinIcon'
import type { Position } from '../types'

type SortKey = 'symbol' | 'market_value' | 'unrealized_pl' | 'change_24h_pl'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'symbol', label: 'Coin' },
  { key: 'market_value', label: 'Market value' },
  { key: 'unrealized_pl', label: 'Total return' },
  { key: 'change_24h_pl', label: 'Today' },
]

export function PositionsTable({ positions }: { positions: Position[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('market_value')
  const [isDescending, setIsDescending] = useState(true)

  const sorted = [...positions].sort((a, b) => {
    const delta =
      sortKey === 'symbol'
        ? a.symbol.localeCompare(b.symbol)
        : a[sortKey] - b[sortKey]
    return isDescending ? -delta : delta
  })

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setIsDescending((d) => !d)
    } else {
      setSortKey(key)
      setIsDescending(true)
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-border px-3 pb-2">
        {COLUMNS.map((column) => (
          <button
            key={column.key}
            type="button"
            onClick={() => handleSort(column.key)}
            className={cn(
              'flex items-center gap-1 text-left text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground',
              column.key !== 'symbol' && 'justify-end text-right',
            )}
          >
            {column.label}
            <ArrowUpDown className="size-3" aria-hidden="true" />
          </button>
        ))}
      </div>
      {sorted.map((p) => {
        const isUp = p.unrealized_pl >= 0
        const isUpToday = p.change_24h_pl >= 0
        return (
          <Link
            key={p.symbol}
            to={`/app/coins/${p.symbol}`}
            data-testid="position-row"
            className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-2 rounded-lg px-3 py-2.5 transition-colors duration-200 hover:bg-card"
          >
            <div className="flex items-center gap-3">
              <CoinIcon symbol={p.symbol} className="size-8 text-[10px]" />
              <div>
                <p className="text-sm font-medium">{p.symbol}</p>
                <p className="text-xs text-muted-foreground">
                  {formatUnits(p.units)} @ {formatUsd(p.avg_cost)}
                </p>
              </div>
            </div>
            <p className="text-right text-sm tabular-nums">{formatUsd(p.market_value)}</p>
            <div className="text-right">
              <p className={cn('text-sm tabular-nums', isUp ? 'text-profit' : 'text-loss')}>
                {formatUsd(p.unrealized_pl)}
              </p>
              <p className={cn('text-xs tabular-nums', isUp ? 'text-profit' : 'text-loss')}>
                {formatPct(p.unrealized_pl_pct)}
              </p>
            </div>
            <p
              className={cn(
                'text-right text-sm tabular-nums',
                isUpToday ? 'text-profit' : 'text-loss',
              )}
            >
              {formatUsd(p.change_24h_pl)}
            </p>
          </Link>
        )
      })}
    </div>
  )
}
