import type { PaperTrade } from '../types'

type Props = { trades: PaperTrade[] }

export function LiveTradeFeed({ trades }: Props) {
  if (trades.length === 0) return <p className="muted">No trades yet.</p>
  return (
    <ul className="live-trade-feed">
      {trades.map((t, i) => (
        <li key={`${t.ts}-${t.symbol}-${i}`} className="trade-row">
          <span className="trade-ts">{new Date(t.ts).toLocaleString()}</span>
          <span className="trade-symbol">{t.symbol}</span>
          <span className={t.units >= 0 ? 'pos' : 'neg'}>
            {t.units >= 0 ? 'BUY' : 'SELL'} {Math.abs(t.units).toFixed(6)} @ {t.price}
          </span>
          {t.is_catchup && <span className="badge-catchup">catch-up</span>}
        </li>
      ))}
    </ul>
  )
}
