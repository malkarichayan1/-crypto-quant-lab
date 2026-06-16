import { apiFetch } from './client'
import type {
  BacktestResult,
  BacktestSummary,
  CreateBacktestRequest,
} from '../types'

export function listBacktests(): Promise<BacktestSummary[]> {
  return apiFetch<BacktestSummary[]>('/backtests')
}

export function getBacktest(id: string): Promise<BacktestResult> {
  return apiFetch<BacktestResult>(`/backtests/${id}`)
}

export function createBacktest(
  body: CreateBacktestRequest,
): Promise<BacktestResult> {
  return apiFetch<BacktestResult>('/backtests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function deleteBacktest(id: string): Promise<void> {
  await apiFetch<void>(`/backtests/${id}`, { method: 'DELETE' })
}
