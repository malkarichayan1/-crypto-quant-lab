import { Link } from 'react-router-dom'
import type { BacktestSummary } from '../types'
import { formatNum, formatPct, signClass } from '../lib/format'

type Props = {
  summary: BacktestSummary
  onDelete: (id: string) => void
}

export function RunCard({ summary, onDelete }: Props) {
  const { metrics } = summary
  const date = new Date(summary.created_at).toLocaleDateString()

  return (
    <div className="run-card">
      <Link to={`/app/lab/backtests/${summary.id}`} className="run-card-title">
        {summary.name}
      </Link>
      <span className="run-card-date">{date}</span>
      <div className="run-card-metrics">
        {'sharpe' in metrics && (
          <span>SR <strong>{formatNum(metrics.sharpe)}</strong></span>
        )}
        {'total_return' in metrics && (
          <span className={signClass(metrics.total_return)}>
            {formatPct(metrics.total_return)}
          </span>
        )}
        {'max_drawdown' in metrics && (
          <span className="neg">{formatPct(metrics.max_drawdown)}</span>
        )}
      </div>
      <button type="button" onClick={() => onDelete(summary.id)}>Delete</button>
    </div>
  )
}
