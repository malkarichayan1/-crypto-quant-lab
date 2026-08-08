import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PortfolioPage } from './PortfolioPage'
import * as portfolioApi from '../api/portfolio'
import type { Position } from '../types'

vi.mock('../api/portfolio')

function position(symbol: string, marketValue: number): Position {
  return {
    symbol, units: 1, avg_cost: 100, price: marketValue,
    market_value: marketValue, unrealized_pl: marketValue - 100,
    unrealized_pl_pct: (marketValue - 100) / 100, change_24h_pl: 1,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PortfolioPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PortfolioPage', () => {
  beforeEach(() => {
    vi.mocked(portfolioApi.getPortfolio).mockResolvedValue({
      portfolio_id: 'p1', starting_cash: 100000, cash: 99000,
      positions: [position('BTC', 500), position('ETH', 900)],
      equity: 100400, today_pl: 2, total_return_pct: 0.004,
      stale: false, created_at: '2026-07-30T00:00:00Z',
    })
    vi.mocked(portfolioApi.getPortfolioOrders).mockResolvedValue([
      { id: 'o2', symbol: 'ETH', side: 'sell', usd_amount: 100, units: 10,
        fill_price: 10, created_at: '2026-07-30T11:00:00Z' },
      { id: 'o1', symbol: 'BTC', side: 'buy', usd_amount: 250, units: 2.5,
        fill_price: 100, created_at: '2026-07-30T10:00:00Z' },
    ])
  })

  it('renders positions in the default tab', async () => {
    renderPage()
    // CoinIcon renders the symbol's initials in a decorative (aria-hidden)
    // div alongside the row's plain-text symbol <p> — for 3-letter symbols
    // like BTC/ETH those texts are identical, so scope to <p> to avoid a
    // "multiple elements" match. Same pattern as App.test.tsx.
    expect(await screen.findByText('BTC', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('ETH', { selector: 'p' })).toBeInTheDocument()
  })

  it('defaults to market value descending and toggles on header click', async () => {
    renderPage()
    await screen.findByText('BTC', { selector: 'p' })
    let rows = screen.getAllByTestId('position-row')
    expect(within(rows[0]).getByText('ETH', { selector: 'p' })).toBeInTheDocument() // 900 > 500 desc default
    await userEvent.click(screen.getByRole('button', { name: /market value/i }))
    rows = screen.getAllByTestId('position-row')
    expect(within(rows[0]).getByText('BTC', { selector: 'p' })).toBeInTheDocument() // toggled to ascending
  })

  it('shows order history in the Orders tab', async () => {
    renderPage()
    await screen.findByText('BTC', { selector: 'p' })
    await userEvent.click(screen.getByRole('tab', { name: /orders/i }))
    expect(await screen.findByText(/sold \$100\.00 of eth/i)).toBeInTheDocument()
  })

  it('shows the activity timeline in the Activity tab', async () => {
    renderPage()
    await screen.findByText('BTC', { selector: 'p' })
    await userEvent.click(screen.getByRole('tab', { name: /activity/i }))
    expect(await screen.findByText(/bought \$250\.00 of btc/i)).toBeInTheDocument()
  })

  it('shows a designed empty state without positions', async () => {
    vi.mocked(portfolioApi.getPortfolio).mockResolvedValue({
      portfolio_id: 'p1', starting_cash: 100000, cash: 100000, positions: [],
      equity: 100000, today_pl: 0, total_return_pct: 0,
      stale: false, created_at: '2026-07-30T00:00:00Z',
    })
    renderPage()
    expect(
      await screen.findByText(/don't own any coins yet/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /explore markets/i })).toHaveAttribute(
      'href', '/markets',
    )
  })

  it('shows a portfolio error state with retry when the portfolio fails to load, and recovers on retry', async () => {
    vi.mocked(portfolioApi.getPortfolio).mockReset()
    vi.mocked(portfolioApi.getPortfolio)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        portfolio_id: 'p1', starting_cash: 100000, cash: 99000,
        positions: [position('BTC', 500), position('ETH', 900)],
        equity: 100400, today_pl: 2, total_return_pct: 0.004,
        stale: false, created_at: '2026-07-30T00:00:00Z',
      })

    renderPage()
    expect(await screen.findByText(/couldn't load your portfolio/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('BTC', { selector: 'p' })).toBeInTheDocument()
  })
})
