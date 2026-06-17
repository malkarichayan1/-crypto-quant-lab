import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { IterationCard } from './IterationCard'

const iterEvent = {
  type: 'iteration_complete' as const,
  iteration_index: 0,
  research_note: 'Use momentum strategy.',
  spec_json: null,
  backtest_id: 'abc-123',
  metrics: { sharpe: 1.2, total_return: 0.35, max_drawdown: -0.08 },
  critic_note: 'Good result!',
  failed: false,
  cost_usd: 0.05,
}

describe('IterationCard', () => {
  it('shows iteration number', () => {
    render(<MemoryRouter><IterationCard event={iterEvent} /></MemoryRouter>)
    expect(screen.getByText(/Iteration 1/i)).toBeInTheDocument()
  })

  it('shows research note', () => {
    render(<MemoryRouter><IterationCard event={iterEvent} /></MemoryRouter>)
    expect(screen.getByText(/momentum strategy/i)).toBeInTheDocument()
  })

  it('shows sharpe metric', () => {
    render(<MemoryRouter><IterationCard event={iterEvent} /></MemoryRouter>)
    expect(screen.getByText(/1\.20/)).toBeInTheDocument()
  })

  it('shows failed badge when failed', () => {
    render(
      <MemoryRouter>
        <IterationCard event={{ ...iterEvent, failed: true, backtest_id: null, metrics: null }} />
      </MemoryRouter>
    )
    expect(screen.getByText(/failed/i)).toBeInTheDocument()
  })
})
