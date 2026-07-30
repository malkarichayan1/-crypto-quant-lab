import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TopBar } from './TopBar'
import * as marketApi from '../api/market'

vi.mock('../api/market')

function Probe() {
  const { symbol } = useParams()
  return <p>trade view for {symbol}</p>
}

function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<TopBar />} />
          <Route path="/coins/:symbol" element={<><TopBar /><Probe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TopBar', () => {
  beforeEach(() => {
    vi.mocked(marketApi.getMarketAssets).mockResolvedValue({
      assets: [
        { symbol: 'BTC', name: 'Bitcoin', price: 64000, change_24h_pct: 0.01, high_24h: 0, low_24h: 0, volume_24h: 0, sparkline: [] },
        { symbol: 'ETH', name: 'Ethereum', price: 3400, change_24h_pct: 0.01, high_24h: 0, low_24h: 0, volume_24h: 0, sparkline: [] },
      ],
      stale: false,
      as_of: '2026-07-30T12:00:00Z',
    })
  })

  it('renders the brand', () => {
    renderBar()
    expect(screen.getByText('HedgeFund Sim')).toBeInTheDocument()
  })

  it('shows matches while typing and navigates on selection', async () => {
    renderBar()
    await userEvent.type(screen.getByPlaceholderText(/search coins/i), 'bit')
    const option = await screen.findByRole('button', { name: /bitcoin/i })
    await userEvent.click(option)
    expect(screen.getByText('trade view for BTC')).toBeInTheDocument()
  })

  it('shows no dropdown for a query with no matches', async () => {
    renderBar()
    await userEvent.type(screen.getByPlaceholderText(/search coins/i), 'zzz')
    expect(screen.queryByRole('button', { name: /bitcoin/i })).not.toBeInTheDocument()
  })
})
