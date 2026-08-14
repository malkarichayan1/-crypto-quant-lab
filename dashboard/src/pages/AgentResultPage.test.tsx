import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AgentResultPage } from './AgentResultPage'

vi.mock('../api/agentRuns', () => ({
  getAgentRun: vi.fn().mockResolvedValue({
    id: 'abc',
    goal: 'maximize sharpe',
    universe: ['BTC/USDT'],
    date_start: '2022-01-01',
    date_end: '2023-12-31',
    starting_cash: 10000,
    budget_usd: 1.0,
    target_metric: null,
    target_value: null,
    model: 'claude-sonnet-4-6',
    status: 'running',
    cost_usd: 0.0,
    winner_backtest_id: null,
    created_at: '2026-06-16T00:00:00Z',
    finished_at: null,
    iterations: [],
  }),
  useAgentRunEvents: vi.fn().mockReturnValue({ events: [], connected: false, done: false }),
}))

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/research/runs/abc']}>
        <Routes>
          <Route path="/research/runs/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AgentResultPage', () => {
  it('renders run goal from query', async () => {
    wrap(<AgentResultPage />)
    expect(await screen.findByRole('heading', { name: 'maximize sharpe' })).toBeInTheDocument()
  })

  it('renders a breadcrumb trail to the research run', async () => {
    wrap(<AgentResultPage />)
    expect(await screen.findByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute(
      'href',
      '/app/lab/research/history',
    )
  })
})
