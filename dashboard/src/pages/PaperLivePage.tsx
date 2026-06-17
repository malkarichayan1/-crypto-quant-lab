import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPaperSession, stopPaperSession, usePaperSessionEvents } from '../api/paperSessions'
import { HoldingsTable } from '../components/HoldingsTable'
import { LiveTradeFeed } from '../components/LiveTradeFeed'

export function PaperLivePage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['paper-session', id],
    queryFn: () => getPaperSession(id!),
    refetchInterval: 30_000,
  })
  usePaperSessionEvents(id)
  const stop = useMutation({
    mutationFn: () => stopPaperSession(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paper-session', id] }),
  })

  if (isLoading) return <p>Loading…</p>
  if (isError) return <p className="neg">{(error as Error).message}</p>
  if (!data) return null

  const latestEquity = data.equity[data.equity.length - 1]?.equity ?? data.starting_cash
  const positions = buildPositions(data.trades)
  const isActive = data.status === 'active'

  return (
    <div>
      <div className="paper-live-header">
        <h2>{data.label}</h2>
        <div className="paper-session-meta">
          <span className={`status-badge status-${data.status}`}>{data.status}</span>
          <span className="muted">{data.universe.join(', ')}</span>
          {isActive && (
            <button onClick={() => stop.mutate()} disabled={stop.isPending}>
              {stop.isPending ? 'Stopping…' : 'Stop'}
            </button>
          )}
        </div>
        <div className="paper-live-equity">${latestEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      </div>

      {data.error && <p className="neg">{data.error}</p>}

      <h3>Holdings</h3>
      <HoldingsTable positions={positions} />

      <h3>Trade Feed</h3>
      <LiveTradeFeed trades={data.trades} />
    </div>
  )
}

function buildPositions(trades: { symbol: string; units: number }[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const t of trades) {
    map[t.symbol] = (map[t.symbol] ?? 0) + t.units
  }
  return Object.fromEntries(
    Object.entries(map).filter(([, units]) => Math.abs(units) > 1e-9)
  )
}
