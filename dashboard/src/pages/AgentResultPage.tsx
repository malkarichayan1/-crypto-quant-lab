import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAgentRun, useAgentRunEvents } from '../api/agentRuns'
import { IterationCard } from '../components/IterationCard'
import type { SSEEvent } from '../types'

export function AgentResultPage() {
  const { id } = useParams<{ id: string }>()

  const { data: run } = useQuery({
    queryKey: ['agent-runs', id],
    queryFn: () => getAgentRun(id!),
    enabled: !!id,
  })

  const { events, connected, done } = useAgentRunEvents(id)

  const iterEvents = events.filter(
    (e): e is Extract<SSEEvent, { type: 'iteration_complete' }> =>
      e.type === 'iteration_complete'
  )

  const runDone = events.find((e) => e.type === 'run_done') as
    | Extract<SSEEvent, { type: 'run_done' }>
    | undefined

  return (
    <div>
      <div className="agent-run-header">
        <h2>{run?.goal ?? 'Research Run'}</h2>
        <div className="agent-run-budget">
          ${run?.cost_usd?.toFixed(3) ?? '0.000'} / ${run?.budget_usd?.toFixed(2) ?? '?'}
          {!done && connected && <span> · streaming…</span>}
          {done && runDone && <span> · {runDone.status}</span>}
        </div>
      </div>

      {iterEvents.length === 0 && !done && <p>Waiting for first iteration…</p>}

      {iterEvents.map((ev) => (
        <IterationCard key={ev.iteration_index} event={ev} />
      ))}

      {runDone?.winner_backtest_id && (
        <p className="pos">
          Best run:{' '}
          <a href={`/backtests/${runDone.winner_backtest_id}`}>view result →</a>
        </p>
      )}
    </div>
  )
}
