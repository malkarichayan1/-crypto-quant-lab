import { Link } from 'react-router-dom'
import type { SSEEvent } from '../types'

type Props = {
  event: Extract<SSEEvent, { type: 'iteration_complete' }>
}

export function IterationCard({ event }: Props) {
  const { iteration_index, research_note, backtest_id, metrics, critic_note, failed } = event

  return (
    <div className="iteration-card">
      <div className="iteration-header">
        <span className="iteration-num">Iteration {iteration_index + 1}</span>
        {failed && <span className="badge-failed">failed</span>}
        {backtest_id && (
          <Link to={`/backtests/${backtest_id}`} className="iteration-link">
            View backtest →
          </Link>
        )}
      </div>

      {research_note && (
        <details className="iteration-section">
          <summary>Research note</summary>
          <p className="iteration-note">{research_note}</p>
        </details>
      )}

      {metrics && (
        <div className="iteration-metrics">
          {(['sharpe', 'total_return', 'max_drawdown'] as const)
            .filter((k) => k in metrics)
            .map((k) => (
              <span key={k} className={metrics[k] < 0 ? 'neg' : 'pos'}>
                {k}: {metrics[k].toFixed(2)}
              </span>
            ))}
        </div>
      )}

      {critic_note && (
        <details className="iteration-section">
          <summary>Critic</summary>
          <p className="iteration-note">{critic_note}</p>
        </details>
      )}
    </div>
  )
}
