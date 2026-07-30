import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useWatchlist } from './useWatchlist'
import * as watchlistApi from '../api/watchlist'

vi.mock('../api/watchlist')

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useWatchlist', () => {
  beforeEach(() => {
    vi.mocked(watchlistApi.getWatchlist).mockResolvedValue({ symbols: ['BTC'] })
    vi.mocked(watchlistApi.starSymbol).mockResolvedValue({ symbols: ['BTC', 'ETH'] })
    vi.mocked(watchlistApi.unstarSymbol).mockResolvedValue({ symbols: [] })
  })

  it('exposes the starred set', async () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper })
    await waitFor(() => expect(result.current.starred.has('BTC')).toBe(true))
  })

  it('toggle stars an unstarred symbol and unstars a starred one', async () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper })
    await waitFor(() => expect(result.current.starred.has('BTC')).toBe(true))

    result.current.toggle('ETH')
    await waitFor(() => expect(watchlistApi.starSymbol).toHaveBeenCalledWith('ETH'))

    result.current.toggle('BTC')
    await waitFor(() => expect(watchlistApi.unstarSymbol).toHaveBeenCalledWith('BTC'))
  })
})
