import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MarketsPage } from './MarketsPage'
import * as marketApi from '../api/market'
import * as watchlistApi from '../api/watchlist'
import type { AssetQuote } from '../types'

vi.mock('../api/market')
vi.mock('../api/watchlist')

function quote(symbol: string, name: string, price: number, change = 0.01): AssetQuote {
  return {
    symbol, name, price, change_24h_pct: change,
    high_24h: price, low_24h: price, volume_24h: 1,
    sparkline: [price * 0.99, price],
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MarketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...view, qc }
}

describe('MarketsPage', () => {
  beforeEach(() => {
    vi.mocked(marketApi.getMarketAssets).mockResolvedValue({
      assets: [
        quote('BTC', 'Bitcoin', 64000),
        quote('ETH', 'Ethereum', 3400),
        quote('SOL', 'Solana', 180),
      ],
      stale: false,
      as_of: '2026-07-30T12:00:00Z',
    })
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue({ symbols: [] })
  })

  it('renders a row per asset', async () => {
    renderPage()
    expect(await screen.findByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('Ethereum')).toBeInTheDocument()
    expect(screen.getByText('Solana')).toBeInTheDocument()
  })

  it('pins starred coins to the top', async () => {
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue({ symbols: ['SOL'] })
    renderPage()
    await screen.findByText('Bitcoin')
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/app/coins/SOL')
  })

  it('filters rows by search query', async () => {
    renderPage()
    await screen.findByText('Bitcoin')
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'sol')
    expect(screen.getByText('Solana')).toBeInTheDocument()
    expect(screen.queryByText('Bitcoin')).not.toBeInTheDocument()
  })

  it('shows the stale banner when prices are delayed', async () => {
    vi.mocked(marketApi.getMarketAssets).mockResolvedValue({
      assets: [quote('BTC', 'Bitcoin', 64000)],
      stale: true,
      as_of: '2026-07-30T12:00:00Z',
    })
    renderPage()
    expect(await screen.findByRole('status')).toHaveTextContent(/prices delayed/i)
  })

  it('shows an error state with retry when the request fails', async () => {
    vi.mocked(marketApi.getMarketAssets).mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText(/couldn't load market data/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('keeps showing existing data when a background refetch fails', async () => {
    const { qc } = renderPage()
    await screen.findByText('Bitcoin')

    vi.mocked(marketApi.getMarketAssets).mockRejectedValueOnce(new Error('network blip'))
    await qc.refetchQueries({ queryKey: ['market-assets'] }).catch(() => {})

    await waitFor(() => {
      expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    })
    expect(screen.queryByText(/couldn't load market data/i)).not.toBeInTheDocument()
  })
})
