import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LeaderboardPage } from './LeaderboardPage'

const getLeaderboard = vi.fn()
vi.mock('../api/leaderboard', () => ({ getLeaderboard: () => getLeaderboard() }))

vi.mock('../components/Sparkline', () => ({
  Sparkline: () => <div data-testid="sparkline" />,
}))

const ROWS = [
  {
    label: 'You', kind: 'you' as const, start_date: '2026-07-01T00:00:00Z',
    total_return_pct: 0.15, equity: 115_000, sparkline: [100, 115],
  },
  {
    label: 'Momentum v1', kind: 'ai' as const, start_date: '2026-07-15T00:00:00Z',
    total_return_pct: -0.05, equity: 9_500, sparkline: [100, 95],
  },
  {
    label: 'Buy & hold BTC', kind: 'benchmark' as const, start_date: '2026-07-01T00:00:00Z',
    total_return_pct: 0.08, equity: 108_000, sparkline: [100, 108],
  },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LeaderboardPage />
    </QueryClientProvider>,
  )
}

describe('LeaderboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getLeaderboard.mockResolvedValue({ rows: ROWS, stale: false })
  })

  it('renders a heading', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: /leaderboard/i })).toBeInTheDocument()
  })

  it('renders one row per participant', async () => {
    renderPage()

    expect(await screen.findByText('You')).toBeInTheDocument()
    expect(screen.getByText('Momentum v1')).toBeInTheDocument()
    expect(screen.getByText('Buy & hold BTC')).toBeInTheDocument()
  })

  it('shows each return as a percentage', async () => {
    renderPage()

    expect(await screen.findByText('+15.00%')).toBeInTheDocument()
    expect(screen.getByText('-5.00%')).toBeInTheDocument()
  })

  it('shows start dates, since participants began at different times', async () => {
    renderPage()

    await screen.findByText('You')
    expect(screen.getAllByText(/Jul .*2026/).length).toBeGreaterThan(0)
  })

  it('renders a sparkline per row', async () => {
    renderPage()

    expect(await screen.findAllByTestId('sparkline')).toHaveLength(3)
  })

  it('explains that start dates differ', async () => {
    renderPage()

    expect(await screen.findByText(/different start dates/i)).toBeInTheDocument()
  })

  it('offers a retry when the fetch fails', async () => {
    getLeaderboard.mockRejectedValue(new Error('boom'))

    renderPage()

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows an empty state when there are no rows', async () => {
    getLeaderboard.mockResolvedValue({ rows: [], stale: false })

    renderPage()

    expect(await screen.findByText(/nothing to compare/i)).toBeInTheDocument()
  })
})
