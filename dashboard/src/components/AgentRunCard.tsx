import { Link } from 'react-router-dom'
import type { AgentRunSummary } from '../types'

type Props = {
  run: AgentRunSummary
}

export function AgentRunCard({ run }: Props) {
  return (
    <Link to={`/research/runs/${run.id}`} className="agent-run-card">
      <div className="agent-run-goal">{run.goal}</div>
      <div className="agent-run-meta">
        <span className={`status-badge status-${run.status}`}>{run.status}</span>
        <span className="agent-run-cost">${run.cost_usd.toFixed(2)}</span>
      </div>
      <div className="agent-run-date">{new Date(run.created_at).toLocaleDateString()}</div>
    </Link>
  )
}
