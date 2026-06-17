import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PaperLivePage } from './PaperLivePage'

vi.mock('../api/paperSessions', () => ({
  getPaperSession: vi.fn().mockResolvedValue({
    id: 'abc-123',
    label: 'Test Session',
    status: 'active',
    universe: ['BTC/USDT'],
    timeframe: '1h',
    starting_cash: 10000,
    source_backtest_id: null,
    last_processed_ts: null,
    error: null,
    created_at: '2026-06-17T00:00:00Z',
    stopped_at: null,
    spec_json: {},
    equity: [{ ts: '2026-06-17T01:00:00Z', equity: 10100 }],
    trades: [],
  }),
  stopPaperSession: vi.fn().mockResolvedValue({}),
  usePaperSessionEvents: vi.fn().mockReturnValue({ events: [], connected: false }),
}))

function wrap(sessionId = 'abc-123') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/paper/sessions/${sessionId}`]}>
        <Routes>
          <Route path="/paper/sessions/:id" element={<PaperLivePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PaperLivePage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders session label once loaded', async () => {
    wrap()
    expect(await screen.findByText('Test Session')).toBeInTheDocument()
  })

  it('renders equity value', async () => {
    wrap()
    expect(await screen.findByText(/10[,.]?100/)).toBeInTheDocument()
  })
})
