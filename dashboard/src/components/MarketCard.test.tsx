import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MarketCard } from './MarketCard'
import type { AssetQuote } from '../types'

const btc: AssetQuote = {
  symbol: 'BTC',
  name: 'Bitcoin',
  price: 64231.5,
  change_24h_pct: 0.0231,
  high_24h: 65000,
  low_24h: 63000,
  volume_24h: 1_000_000,
  sparkline: [63000, 63500, 64231.5],
}

function renderCard(overrides: Partial<AssetQuote> = {}) {
  return render(
    <MemoryRouter>
      <MarketCard asset={{ ...btc, ...overrides }} />
    </MemoryRouter>,
  )
}

describe('MarketCard', () => {
  it('links to the trade view and shows name, price, and change', () => {
    renderCard()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/coins/BTC')
    expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('$64,231.50')).toBeInTheDocument()
    expect(screen.getByText('+2.31%')).toBeInTheDocument()
  })

  it('shows a loss in the loss tone when 24h change is negative', () => {
    renderCard({ change_24h_pct: -0.05 })
    expect(screen.getByText('-5.00%')).toHaveClass('text-loss')
  })
})
