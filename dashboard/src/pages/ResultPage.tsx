import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { getBacktest } from '../api/backtests'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { EquityChart } from '../components/EquityChart'
import { MetricsPanel } from '../components/MetricsPanel'
import { TradeLogTable } from '../components/TradeLogTable'

export function ResultPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['backtests', id],
    queryFn: () => getBacktest(id!),
    enabled: !!id,
  })

  if (isLoading) return <p>Loading…</p>
  if (isError) return <p className="neg">{(error as Error).message}</p>
  if (!data) return null

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/app' },
          { label: 'Strategy Lab' },
          { label: 'Backtests', to: '/app/lab/backtests/history' },
          { label: data.name },
        ]}
      />
      <h2>{data.name}</h2>
      <div className="result-layout">
        <div className="chart-col">
          <EquityChart result={data} />
        </div>
        <MetricsPanel metrics={data.metrics} />
      </div>
      <TradeLogTable trades={data.trade_log} />
      <div style={{ marginTop: 'var(--space-3)' }}>
        <Link to={`/app/lab/paper?source_backtest_id=${id}`} className="paper-trade-link">
          Paper trade this →
        </Link>
      </div>
    </div>
  )
}
