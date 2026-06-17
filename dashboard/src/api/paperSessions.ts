import { useEffect, useState } from 'react'
import { apiFetch } from './client'
import type {
  CreatePaperSessionRequest,
  PaperSessionDetail,
  PaperSessionSummary,
  PaperSSEEvent,
} from '../types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const BASE = '/paper-sessions'

export function listPaperSessions(): Promise<PaperSessionSummary[]> {
  return apiFetch<PaperSessionSummary[]>(BASE)
}

export function getPaperSession(id: string): Promise<PaperSessionDetail> {
  return apiFetch<PaperSessionDetail>(`${BASE}/${id}`)
}

export function createPaperSession(body: CreatePaperSessionRequest): Promise<PaperSessionSummary> {
  return apiFetch<PaperSessionSummary>(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function stopPaperSession(id: string): Promise<PaperSessionSummary> {
  return apiFetch<PaperSessionSummary>(`${BASE}/${id}/stop`, { method: 'POST' })
}

export function usePaperSessionEvents(sessionId: string | undefined): {
  events: PaperSSEEvent[]
  connected: boolean
} {
  const [events, setEvents] = useState<PaperSSEEvent[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    const es = new EventSource(`${BASE_URL}${BASE}/${sessionId}/events`)
    setConnected(true)
    const onTick = (e: MessageEvent) =>
      setEvents((prev) => [...prev, JSON.parse(e.data) as PaperSSEEvent])
    const onStopped = (e: MessageEvent) => {
      setEvents((prev) => [...prev, JSON.parse(e.data) as PaperSSEEvent])
      es.close()
      setConnected(false)
    }
    es.addEventListener('tick', onTick)
    es.addEventListener('session_stopped', onStopped)
    es.addEventListener('session_error', onStopped)
    es.onerror = () => { es.close(); setConnected(false) }
    return () => { es.close(); setConnected(false) }
  }, [sessionId])

  return { events, connected }
}
