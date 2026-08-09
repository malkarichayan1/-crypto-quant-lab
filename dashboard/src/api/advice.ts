import { apiFetch } from './client'
import type { AdviceResponse } from '../types'

function path(symbol?: string): string {
  return symbol ? `/advice?symbol=${encodeURIComponent(symbol)}` : '/advice'
}

/** Cached advice only — this call never triggers an LLM request server-side. */
export function getAdvice(symbol?: string): Promise<AdviceResponse> {
  return apiFetch<AdviceResponse>(path(symbol))
}

/** Generate advice on demand. Reuses a fresh server-side cache entry if present. */
export function generateAdvice(symbol?: string): Promise<AdviceResponse> {
  return apiFetch<AdviceResponse>(path(symbol), { method: 'POST' })
}
