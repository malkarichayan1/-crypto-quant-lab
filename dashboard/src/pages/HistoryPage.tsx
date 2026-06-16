import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteBacktest, listBacktests } from '../api/backtests'
import { RunCard } from '../components/RunCard'

export function HistoryPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['backtests'],
    queryFn: listBacktests,
  })

  const del = useMutation({
    mutationFn: (id: string) => deleteBacktest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backtests'] }),
  })

  if (isLoading) return <p>Loading…</p>
  if (isError) return <p className="neg">{(error as Error).message}</p>

  const runs = data ?? []
  if (runs.length === 0) {
    return <p>No runs yet — go to New Run to get started.</p>
  }

  return (
    <div>
      <h2>Past Runs</h2>
      <div className="run-grid">
        {runs.map((summary) => (
          <RunCard
            key={summary.id}
            summary={summary}
            onDelete={(id) => del.mutate(id)}
          />
        ))}
      </div>
    </div>
  )
}
