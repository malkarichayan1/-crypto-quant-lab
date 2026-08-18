import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PortfolioSummaryCard } from './PortfolioSummaryCard'
import { getPortfolio } from '../api/portfolio'
import type { PortfolioSummary } from '../types'

vi.mock('../api/portfolio', () => ({ getPortfolio: vi.fn() }))

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PortfolioSummaryCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function makePortfolio(overrides: Partial<PortfolioSummary> = {}): PortfolioSummary {
  return {
    portfolio_id: 'p1',
    starting_cash: 100_000,
    cash: 50_000,
    positions: [],
    equity: 105_000,
    today_pl: 1_200,
    total_return_pct: 0.05,
    stale: false,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

describe('PortfolioSummaryCard', () => {
  it('renders equity and a positive today P/L, linking to the Portfolio page', async () => {
    vi.mocked(getPortfolio).mockResolvedValue(makePortfolio())
    renderCard()

    expect(await screen.findByText('$105,000.00')).toBeInTheDocument()
    expect(screen.getByText(/\+\$1,200\.00 today/)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/portfolio')
  })

  it('renders a negative today P/L without a leading plus sign', async () => {
    vi.mocked(getPortfolio).mockResolvedValue(makePortfolio({ today_pl: -300 }))
    renderCard()

    expect(await screen.findByText(/-\$300\.00 today/)).toBeInTheDocument()
  })

  it('renders nothing when the portfolio fails to load', async () => {
    vi.mocked(getPortfolio).mockRejectedValue(new Error('network down'))
    const { container } = renderCard()

    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
