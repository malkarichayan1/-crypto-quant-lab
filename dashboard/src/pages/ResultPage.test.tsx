import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ResultPage } from './ResultPage'
import * as api from '../api/backtests'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ResultPage', () => {
  it('fetches and renders the result name and metrics', async () => {
    vi.spyOn(api, 'getBacktest').mockResolvedValue({
      id: 'abc-123',
      name: 'momentum_2024',
      created_at: '2026-06-15T00:00:00Z',
      duration_ms: 7,
      metrics: { sharpe: 1.42, total_return: 0.64 },
      starting_cash: 10000,
      spec: {},
      equity_curve: [['2021-01-01', 10000], ['2021-01-02', 11000]],
      benchmark_curve: null,
      trade_log: [],
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/backtests/abc-123']}>
          <Routes>
            <Route path="/backtests/:id" element={<ResultPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('momentum_2024')).toBeInTheDocument()
    })
    expect(screen.getByText('Sharpe')).toBeInTheDocument()
  })
})
