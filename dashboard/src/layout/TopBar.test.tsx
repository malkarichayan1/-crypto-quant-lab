import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
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

// Mirrors the real AppShell: TopBar is rendered once, as a sibling of the
// routed content, so it never remounts when the route changes underneath it.
function renderPersistent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <TopBar />
        <Routes>
          <Route
            path="/"
            element={
              <nav>
                <Link to="/portfolio">Portfolio</Link>
              </nav>
            }
          />
          <Route path="/portfolio" element={<p>portfolio content</p>} />
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
    const option = await screen.findByRole('option', { name: /bitcoin/i })
    await userEvent.click(option)
    expect(screen.getByText('trade view for BTC')).toBeInTheDocument()
  })

  it('shows no dropdown for a query with no matches', async () => {
    renderBar()
    await userEvent.type(screen.getByPlaceholderText(/search coins/i), 'zzz')
    expect(screen.queryByRole('option', { name: /bitcoin/i })).not.toBeInTheDocument()
  })

  it('marks the results dropdown open via aria-expanded on the search input', async () => {
    renderBar()
    const input = screen.getByPlaceholderText(/search coins/i)
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await userEvent.type(input, 'bit')
    await screen.findByRole('option', { name: /bitcoin/i })
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes the dropdown when the route changes without selecting a result', async () => {
    renderPersistent()
    await userEvent.type(screen.getByPlaceholderText(/search coins/i), 'bit')
    expect(await screen.findByRole('option', { name: /bitcoin/i })).toBeInTheDocument()

    // Navigate away via a Sidebar-style link, not a search result.
    await userEvent.click(screen.getByRole('link', { name: /portfolio/i }))

    expect(await screen.findByText('portfolio content')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /bitcoin/i })).not.toBeInTheDocument()
  })

  it('closes the dropdown when navigating via keyboard (no mousedown fires)', async () => {
    // Regression guard for the route-change effect specifically: activating
    // a link via Enter never dispatches mousedown, so this only passes if
    // TopBar reacts to the route change itself rather than relying solely on
    // the outside-click handler.
    renderPersistent()
    await userEvent.type(screen.getByPlaceholderText(/search coins/i), 'bit')
    expect(await screen.findByRole('option', { name: /bitcoin/i })).toBeInTheDocument()

    screen.getByRole('link', { name: /portfolio/i }).focus()
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByText('portfolio content')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /bitcoin/i })).not.toBeInTheDocument()
  })

  it('closes the dropdown on outside click', async () => {
    renderPersistent()
    await userEvent.type(screen.getByPlaceholderText(/search coins/i), 'bit')
    expect(await screen.findByRole('option', { name: /bitcoin/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: /portfolio/i }).closest('nav')!)

    expect(screen.queryByRole('option', { name: /bitcoin/i })).not.toBeInTheDocument()
  })

  it('closes the dropdown on Escape', async () => {
    renderBar()
    const input = screen.getByPlaceholderText(/search coins/i)
    await userEvent.type(input, 'bit')
    expect(await screen.findByRole('option', { name: /bitcoin/i })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('option', { name: /bitcoin/i })).not.toBeInTheDocument()
  })
})
