import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AgentRunCard } from './AgentRunCard'
import type { AgentRunSummary } from '../types'

const run: AgentRunSummary = {
  id: 'run-1',
  goal: 'maximize sharpe',
  universe: ['BTC/USDT'],
  date_start: '2022-01-01',
  date_end: '2023-12-31',
  starting_cash: 10000,
  budget_usd: 1.0,
  target_metric: 'sharpe',
  target_value: 1.5,
  model: 'claude-sonnet-4-6',
  status: 'done',
  cost_usd: 0.42,
  winner_backtest_id: null,
  created_at: '2026-06-16T10:00:00Z',
  finished_at: '2026-06-16T10:05:00Z',
}

describe('AgentRunCard', () => {
  it('shows goal', () => {
    render(<MemoryRouter><AgentRunCard run={run} /></MemoryRouter>)
    expect(screen.getByText(/maximize sharpe/i)).toBeInTheDocument()
  })

  it('shows done status', () => {
    render(<MemoryRouter><AgentRunCard run={run} /></MemoryRouter>)
    expect(screen.getByText(/done/i)).toBeInTheDocument()
  })

  it('shows cost', () => {
    render(<MemoryRouter><AgentRunCard run={run} /></MemoryRouter>)
    expect(screen.getByText(/\$0\.42/)).toBeInTheDocument()
  })
})
