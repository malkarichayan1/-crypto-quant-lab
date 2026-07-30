import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AssetPage } from './AssetPage'
import * as marketApi from '../api/market'
import * as watchlistApi from '../api/watchlist'

vi.mock('../api/market')
vi.mock('../api/watchlist')
vi.mock('../components/PriceChart', () => ({
  PriceChart: ({ mode }: { mode: string }) => (
    <div data-testid="price-chart">{mode}</div>
  ),
}))

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/coins/:symbol" element={<AssetPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
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
  })

  it('renders header, price, stats, and the phase-3 ticket placeholder', async () => {
    renderAt('/coins/BTC')
    expect(await screen.findByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('$64,231.50')).toBeInTheDocument()
    expect(screen.getByText('+2.31%', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/24h high/i)).toBeInTheDocument()
    expect(screen.getByText(/trading opens soon/i)).toBeInTheDocument()
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
})
