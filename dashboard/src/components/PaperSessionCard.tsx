import { Link } from 'react-router-dom'
import type { PaperSessionSummary } from '../types'

type Props = { session: PaperSessionSummary }

export function PaperSessionCard({ session }: Props) {
  return (
    <Link to={`/paper/sessions/${session.id}`} className="paper-session-card">
      <div className="paper-session-label">{session.label}</div>
      <div className="paper-session-meta">
        <span className={`status-badge status-${session.status}`}>{session.status}</span>
        <span className="paper-session-universe">{session.universe.join(', ')}</span>
      </div>
    </Link>
  )
}
