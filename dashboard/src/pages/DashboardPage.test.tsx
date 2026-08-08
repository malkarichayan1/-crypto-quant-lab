import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from './DashboardPage'
import * as portfolioApi from '../api/portfolio'
import * as marketApi from '../api/market'
import * as watchlistApi from '../api/watchlist'

vi.mock('../api/portfolio')
vi.mock('../api/market')
vi.mock('../api/watchlist')

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const PORTFOLIO_FIXTURE = {
  portfolio_id: 'p1', starting_cash: 100000, cash: 55000,
  positions: [{
    symbol: 'BTC', units: 0.5, avg_cost: 60000, price: 64000,
    market_value: 32000, unrealized_pl: 2000, unrealized_pl_pct: 0.0667,
    change_24h_pl: 150,
  }],
  equity: 87000, today_pl: 150, total_return_pct: -0.13,
  stale: false, created_at: '2026-07-30T00:00:00Z',
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(portfolioApi.getPortfolio).mockResolvedValue(PORTFOLIO_FIXTURE)
    vi.mocked(portfolioApi.getPortfolioEquity).mockResolvedValue({
      range: '1M',
      points: [
        { ts: '2026-07-29T00:00:00Z', equity: 86000 },
        { ts: '2026-07-30T00:00:00Z', equity: 87000 },
      ],
    })
    vi.mocked(marketApi.getMarketAssets).mockResolvedValue({
      assets: [
        { symbol: 'BTC', name: 'Bitcoin', price: 64000, change_24h_pct: 0.01,
          high_24h: 0, low_24h: 0, volume_24h: 0, sparkline: [63000, 64000] },
        { symbol: 'ETH', name: 'Ethereum', price: 3400, change_24h_pct: -0.02,
          high_24h: 0, low_24h: 0, volume_24h: 0, sparkline: [3500, 3400] },
      ],
      stale: false, as_of: '2026-07-30T12:00:00Z',
    })
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue({ symbols: ['ETH'] })
  })

  it('renders the four hero stat cards', async () => {
    renderPage()
    expect(await screen.findByText('Portfolio Value')).toBeInTheDocument()
    expect(screen.getByText('$87,000.00')).toBeInTheDocument()
    expect(screen.getByText("Today's P/L")).toBeInTheDocument()
    expect(screen.getByText('Total Return')).toBeInTheDocument()
    expect(screen.getByText('Buying Power')).toBeInTheDocument()
    expect(screen.getByText('$55,000.00')).toBeInTheDocument()
  })

  it('lists holdings under Your coins', async () => {
    renderPage()
    expect(await screen.findByText('Your coins')).toBeInTheDocument()
    // $32,000.00 depends on the portfolio query resolving — await it directly
    // rather than a synchronous check piggybacking on the unrelated
    // "Your coins" header wait above (that header renders before the async
    // portfolio data lands), matching the findBy* precedent used throughout
    // PortfolioPage.test.tsx for data-dependent assertions.
    expect(await screen.findByText('$32,000.00')).toBeInTheDocument()
  })

  it('shows watchlist entries', async () => {
    renderPage()
    expect(await screen.findByText('Watchlist')).toBeInTheDocument()
    // "Ethereum" also appears in the market overview cards
    expect((await screen.findAllByText('Ethereum')).length).toBeGreaterThan(0)
  })

  it('shows market overview cards', async () => {
    renderPage()
    expect(await screen.findByText('Market overview')).toBeInTheDocument()
    // Same async-data reasoning as above: await the market-query-dependent
    // text instead of a synchronous check after the unrelated header wait.
    expect((await screen.findAllByText('Bitcoin')).length).toBeGreaterThan(0)
  })

  it('shows a portfolio error state with retry in the stat card area, and recovers on retry', async () => {
    vi.mocked(portfolioApi.getPortfolio).mockReset()
    vi.mocked(portfolioApi.getPortfolio)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(PORTFOLIO_FIXTURE)

    renderPage()
    expect(await screen.findByText(/couldn't load your portfolio/i)).toBeInTheDocument()
    expect(await screen.findByText(/couldn't load your holdings/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Portfolio Value')).toBeInTheDocument()
    expect(await screen.findByText('$87,000.00')).toBeInTheDocument()
  })
})
