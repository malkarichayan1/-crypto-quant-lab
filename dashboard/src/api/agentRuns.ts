import { useEffect, useRef, useState } from 'react'
import { apiFetch } from './client'
import { API_BASE_URL } from './config'
import type {
  AgentRunDetail,
  AgentRunSummary,
  CreateAgentRunRequest,
  SSEEvent,
} from '../types'

export function listAgentRuns(): Promise<AgentRunSummary[]> {
  return apiFetch<AgentRunSummary[]>('/agent-runs')
}

export function getAgentRun(id: string): Promise<AgentRunDetail> {
  return apiFetch<AgentRunDetail>(`/agent-runs/${id}`)
}

export function createAgentRun(body: CreateAgentRunRequest): Promise<AgentRunSummary> {
  return apiFetch<AgentRunSummary>('/agent-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export type AgentRunEventsState = {
  events: SSEEvent[]
  connected: boolean
  done: boolean
}

export function useAgentRunEvents(runId: string | undefined): AgentRunEventsState {
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [done, setDone] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!runId) return
    const es = new EventSource(`${API_BASE_URL}/agent-runs/${runId}/events`)
    esRef.current = es
    setConnected(true)

    const handleEvent = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSEEvent
        setEvents((prev) => [...prev, data])
        if (data.type === 'run_done') {
          setDone(true)
          es.close()
        }
      } catch {
        // ignore malformed events
      }
    }

    es.addEventListener('run_started', handleEvent)
    es.addEventListener('iteration_complete', handleEvent)
    es.addEventListener('run_done', handleEvent)
    es.onerror = () => setConnected(false)

    return () => {
      es.close()
      setConnected(false)
    }
  }, [runId])

  return { events, connected, done }
}
