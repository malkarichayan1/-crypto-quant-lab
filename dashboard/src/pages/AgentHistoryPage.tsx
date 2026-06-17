import { useQuery } from '@tanstack/react-query'
import { listAgentRuns } from '../api/agentRuns'
import { AgentRunCard } from '../components/AgentRunCard'

export function AgentHistoryPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['agent-runs'],
    queryFn: listAgentRuns,
  })

  if (isLoading) return <p>Loading…</p>
  if (isError) return <p className="neg">{(error as Error).message}</p>

  const runs = data ?? []
  if (runs.length === 0) {
    return <p>No research runs yet — go to Research to get started.</p>
  }

  return (
    <div>
      <h2>Research History</h2>
      <div className="agent-runs-grid">
        {runs.map((run) => (
          <AgentRunCard key={run.id} run={run} />
        ))}
      </div>
    </div>
  )
}
