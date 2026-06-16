import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { NewRunPage } from './NewRunPage'
import * as api from '../api/backtests'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<NewRunPage />} />
          <Route path="/backtests/:id" element={<div>Result Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('NewRunPage', () => {
  it('navigates to the result page after a successful run', async () => {
    vi.spyOn(api, 'createBacktest').mockResolvedValue({
      id: 'abc-123',
      name: 'route_test',
      created_at: '2026-06-15T00:00:00Z',
      duration_ms: 7,
      metrics: { sharpe: 1.4 },
      starting_cash: 10000,
      spec: {},
      equity_curve: [['2021-01-01', 10000]],
      benchmark_curve: null,
      trade_log: [],
    })
    const user = userEvent.setup()
    renderPage()

    // Step 1 → fill name
    await user.type(screen.getByLabelText('Name'), 'route_test')
    await user.click(screen.getByRole('button', { name: 'Next →' })) // → 2
    await user.click(screen.getByRole('button', { name: 'Next →' })) // → 3
    await user.click(screen.getByRole('button', { name: 'Next →' })) // → 4
    await user.click(screen.getByRole('button', { name: 'Run Backtest →' }))

    await waitFor(() => {
      expect(screen.getByText('Result Page')).toBeInTheDocument()
    })
  })

  it('shows the API error message when the run fails', async () => {
    vi.spyOn(api, 'createBacktest').mockRejectedValue(new Error('bad spec'))
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Next →' }))
    await user.click(screen.getByRole('button', { name: 'Next →' }))
    await user.click(screen.getByRole('button', { name: 'Next →' }))
    await user.click(screen.getByRole('button', { name: 'Run Backtest →' }))

    await waitFor(() => {
      expect(screen.getByText('bad spec')).toBeInTheDocument()
    })
  })
})
