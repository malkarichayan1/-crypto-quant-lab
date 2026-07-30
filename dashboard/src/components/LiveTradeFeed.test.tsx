import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiveTradeFeed } from './LiveTradeFeed'

describe('LiveTradeFeed', () => {
  it('renders fills and tags catch-up rows', () => {
    render(<LiveTradeFeed trades={[
      { ts: '2026-06-17T01:00:00Z', symbol: 'BTC/USDT', units: 0.1, price: 100, is_catchup: true },
    ]} />)
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
    expect(screen.getByText(/catch-up/i)).toBeInTheDocument()
  })

  it('shows empty state with no trades', () => {
    render(<LiveTradeFeed trades={[]} />)
    expect(screen.getByText(/no trades yet/i)).toBeInTheDocument()
  })
})
