import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { HistoryPage } from './HistoryPage'
import * as api from '../api/backtests'

beforeEach(() => {
  vi.restoreAllMocks()
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HistoryPage', () => {
  it('shows the empty state when there are no runs', async () => {
    vi.spyOn(api, 'listBacktests').mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/no runs yet/i)).toBeInTheDocument()
    })
  })

  it('renders a card per run', async () => {
    vi.spyOn(api, 'listBacktests').mockResolvedValue([
      { id: 'a', name: 'run_a', created_at: '2026-06-15T00:00:00Z', duration_ms: 5, metrics: { sharpe: 1.0 } },
      { id: 'b', name: 'run_b', created_at: '2026-06-14T00:00:00Z', duration_ms: 6, metrics: { sharpe: 2.0 } },
    ])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('run_a')).toBeInTheDocument()
    })
    expect(screen.getByText('run_b')).toBeInTheDocument()
  })
})
