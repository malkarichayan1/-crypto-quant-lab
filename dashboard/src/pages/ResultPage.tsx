import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { getBacktest } from '../api/backtests'
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
      <h2>{data.name}</h2>
      <div className="result-layout">
        <div className="chart-col">
          <EquityChart result={data} />
        </div>
        <MetricsPanel metrics={data.metrics} />
      </div>
      <TradeLogTable trades={data.trade_log} />
    </div>
  )
}
