import { useQuery } from '@tanstack/react-query'
import { listPaperSessions } from '../api/paperSessions'
import { PaperSessionCard } from '../components/PaperSessionCard'

export function PaperHistoryPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['paper-sessions'],
    queryFn: listPaperSessions,
  })
  if (isLoading) return <p>Loading…</p>
  if (isError) return <p className="neg">{(error as Error).message}</p>
  const sessions = data ?? []
  if (sessions.length === 0) return <p>No paper sessions yet — go to Paper Trading to start one.</p>
  return (
    <div>
      <h2>Paper Sessions</h2>
      <div className="paper-sessions-grid">
        {sessions.map((s) => <PaperSessionCard key={s.id} session={s} />)}
      </div>
    </div>
  )
}
