import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatPct, formatUsd } from '../lib/format'
import { CoinIcon } from './CoinIcon'
import { Sparkline } from './Sparkline'
import type { AssetQuote } from '../types'

export function MarketCard({ asset }: { asset: AssetQuote }) {
  const isPositive = asset.change_24h_pct >= 0
  return (
    <Link to={`/app/coins/${asset.symbol}`}>
      <Card className="transition-colors duration-200 hover:border-primary/40">
        <CardContent className="flex items-center gap-3 p-4">
          <CoinIcon symbol={asset.symbol} className="size-8 text-[10px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{asset.name}</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatUsd(asset.price)}
            </p>
          </div>
          <div className="text-right">
            <Sparkline data={asset.sparkline} isPositive={isPositive} />
            <p
              className={cn(
                'text-xs tabular-nums',
                isPositive ? 'text-profit' : 'text-loss',
              )}
            >
              {formatPct(asset.change_24h_pct)}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
