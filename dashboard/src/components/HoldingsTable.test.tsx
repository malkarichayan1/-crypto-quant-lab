import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HoldingsTable } from './HoldingsTable'

describe('HoldingsTable', () => {
  it('renders a row per position', () => {
    render(<HoldingsTable positions={{ 'BTC/USDT': 0.5, 'ETH/USDT': 2 }} />)
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
    expect(screen.getByText('ETH/USDT')).toBeInTheDocument()
  })

  it('shows empty state when flat', () => {
    render(<HoldingsTable positions={{}} />)
    expect(screen.getByText(/no open positions/i)).toBeInTheDocument()
  })
})
