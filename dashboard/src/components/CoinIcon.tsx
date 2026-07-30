import { cn } from '@/lib/utils'

type Props = {
  symbol: string
  className?: string
}

// Deterministic hue per symbol so each coin gets a stable identity color.
function hueFor(symbol: string): number {
  let hash = 0
  for (const char of symbol) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360
  }
  return hash
}

export function CoinIcon({ symbol, className }: Props) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
        className,
      )}
      style={{ backgroundColor: `hsl(${hueFor(symbol)} 60% 40%)` }}
    >
      {symbol.slice(0, 3)}
    </div>
  )
}
