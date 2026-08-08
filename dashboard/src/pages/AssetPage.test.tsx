import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AssetPage } from './AssetPage'
import * as marketApi from '../api/market'
import * as watchlistApi from '../api/watchlist'
import * as portfolioApi from '../api/portfolio'

vi.mock('../api/market')
vi.mock('../api/watchlist')
vi.mock('../api/portfolio')
vi.mock('../components/PriceChart', () => ({
  PriceChart: ({ mode }: { mode: string }) => (
    <div data-testid="price-chart">{mode}</div>
  ),
}))

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/coins/:symbol" element={<AssetPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...view, qc }
}

describe('AssetPage', () => {
  beforeEach(() => {
    vi.mocked(marketApi.getMarketAssets).mockResolvedValue({
      assets: [{
        symbol: 'BTC', name: 'Bitcoin', price: 64231.5, change_24h_pct: 0.0231,
        high_24h: 65000, low_24h: 63000, volume_24h: 1_000_000,
        sparkline: [63000, 64231.5],
      }],
      stale: false,
      as_of: '2026-07-30T12:00:00Z',
    })
    vi.mocked(marketApi.getAssetCandles).mockResolvedValue({
      symbol: 'BTC', range: '1D', stale: false,
      candles: [{ ts: '2026-07-30T00:00:00Z', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }],
    })
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue({ symbols: [] })
    vi.mocked(portfolioApi.getPortfolio).mockResolvedValue({
      portfolio_id: 'p1', starting_cash: 100000, cash: 99000,
      positions: [{
        symbol: 'BTC', units: 0.01, avg_cost: 60000, price: 64231.5,
        market_value: 642.31, unrealized_pl: 42.31, unrealized_pl_pct: 0.07,
        change_24h_pl: 5,
      }],
      equity: 99642.31, today_pl: 5, total_return_pct: -0.0036,
      stale: false, created_at: '2026-07-30T00:00:00Z',
    })
  })

  it('renders header, price, stats, and the phase-3 ticket placeholder', async () => {
    renderAt('/coins/BTC')
    expect(await screen.findByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('$64,231.50')).toBeInTheDocument()
    expect(screen.getByText('+2.31%', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/24h high/i)).toBeInTheDocument()
    expect(await screen.findByText(/trade btc/i)).toBeInTheDocument()   // OrderTicket header
    expect(screen.getByText(/you own/i)).toBeInTheDocument()
    expect(screen.getByText('$642.31')).toBeInTheDocument()
  })

  it('defaults to line mode and switches to pro mode', async () => {
    renderAt('/coins/BTC')
    expect(await screen.findByTestId('price-chart')).toHaveTextContent('line')
    await userEvent.click(screen.getByRole('switch', { name: /pro view/i }))
    expect(screen.getByTestId('price-chart')).toHaveTextContent('pro')
  })

  it('requests candles for the selected range', async () => {
    renderAt('/coins/BTC')
    await screen.findByText('Bitcoin')
    await userEvent.click(screen.getByRole('button', { name: '1M' }))
    expect(marketApi.getAssetCandles).toHaveBeenLastCalledWith('BTC', '1M')
  })

  it('shows a not-found state for a symbol outside the universe', async () => {
    renderAt('/coins/ZZZ')
    expect(await screen.findByText(/couldn't find that coin/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to markets/i })).toHaveAttribute(
      'href',
      '/markets',
    )
  })

  it('shows an error state with retry when assets fail to load, and recovers on retry', async () => {
    vi.mocked(marketApi.getMarketAssets).mockReset()
    vi.mocked(marketApi.getMarketAssets)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        assets: [{
          symbol: 'BTC', name: 'Bitcoin', price: 64231.5, change_24h_pct: 0.0231,
          high_24h: 65000, low_24h: 63000, volume_24h: 1_000_000,
          sparkline: [63000, 64231.5],
        }],
        stale: false,
        as_of: '2026-07-30T12:00:00Z',
      })

    renderAt('/coins/BTC')
    expect(await screen.findByText(/couldn't load this coin/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Bitcoin')).toBeInTheDocument()
  })

  it('keeps showing existing data when a background assets refetch fails', async () => {
    const { qc } = renderAt('/coins/BTC')
    await screen.findByText('Bitcoin')

    vi.mocked(marketApi.getMarketAssets).mockRejectedValueOnce(new Error('blip'))
    await qc.refetchQueries({ queryKey: ['market-assets'] }).catch(() => {})

    await waitFor(() => {
      expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    })
    expect(screen.queryByText(/couldn't load this coin/i)).not.toBeInTheDocument()
  })

  it('shows a chart error state with retry when candles fail to load', async () => {
    vi.mocked(marketApi.getAssetCandles).mockReset()
    vi.mocked(marketApi.getAssetCandles)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        symbol: 'BTC', range: '1D', stale: false,
        candles: [{ ts: '2026-07-30T00:00:00Z', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }],
      })

    renderAt('/coins/BTC')
    await screen.findByText('Bitcoin')
    expect(await screen.findByText(/couldn't load the chart/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByTestId('price-chart')).toBeInTheDocument()
  })

  it('shows a portfolio error state with retry when the portfolio fails to load, and recovers on retry', async () => {
    vi.mocked(portfolioApi.getPortfolio).mockReset()
    vi.mocked(portfolioApi.getPortfolio)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        portfolio_id: 'p1', starting_cash: 100000, cash: 99000,
        positions: [{
          symbol: 'BTC', units: 0.01, avg_cost: 60000, price: 64231.5,
          market_value: 642.31, unrealized_pl: 42.31, unrealized_pl_pct: 0.07,
          change_24h_pl: 5,
        }],
        equity: 99642.31, today_pl: 5, total_return_pct: -0.0036,
        stale: false, created_at: '2026-07-30T00:00:00Z',
      })

    renderAt('/coins/BTC')
    await screen.findByText('Bitcoin')
    expect(await screen.findByText(/couldn't load your portfolio/i)).toBeInTheDocument()
    // Loading/error state never gets conflated with "holds none of this coin".
    expect(screen.getByText('—', { selector: 'p.text-sm' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText(/trade btc/i)).toBeInTheDocument()
    expect(screen.getByText('$642.31')).toBeInTheDocument()
  })

  it('stops polling candles once the symbol is confirmed invalid', async () => {
    // shouldAdvanceTime keeps the fake clock ticking in near-real-time so
    // RTL's findBy* (which polls via real setTimeout) keeps working, while
    // still letting us jump the clock forward deterministically below.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderAt('/coins/ZZZ')
      await screen.findByText(/couldn't find that coin/i)

      const callsAfterSettled = vi.mocked(marketApi.getAssetCandles).mock.calls.length

      // Jump well past the 30s poll interval — a still-enabled query would
      // have fired at least one more request in that window.
      await vi.advanceTimersByTimeAsync(35_000)

      expect(marketApi.getAssetCandles).toHaveBeenCalledTimes(callsAfterSettled)
    } finally {
      vi.useRealTimers()
    }
  })
})
