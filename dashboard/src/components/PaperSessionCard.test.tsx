import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PaperSessionCard } from './PaperSessionCard'

const session = {
  id: 'abc', label: 'My BTC momentum', source_backtest_id: null,
  universe: ['BTC/USDT'], timeframe: '1h', starting_cash: 10000,
  status: 'active' as const, last_processed_ts: null, error: null,
  created_at: '2026-06-17T00:00:00Z', stopped_at: null,
}

describe('PaperSessionCard', () => {
  it('shows label and status', () => {
    render(<MemoryRouter><PaperSessionCard session={session} /></MemoryRouter>)
    expect(screen.getByText('My BTC momentum')).toBeInTheDocument()
    expect(screen.getByText(/active/i)).toBeInTheDocument()
  })
})
