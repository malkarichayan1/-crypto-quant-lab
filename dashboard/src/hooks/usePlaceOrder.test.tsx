import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlaceOrder } from './usePlaceOrder'

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))

const toastSuccess = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a) } }))

const placeOrder = vi.fn()
vi.mock('../api/portfolio', () => ({ placeOrder: (b: unknown) => placeOrder(b) }))

const ORDER = {
  id: '1', symbol: 'BTC', side: 'buy' as const, usd_amount: 100,
  units: 0.5, fill_price: 200, created_at: '2026-08-08T00:00:00Z',
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('usePlaceOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    placeOrder.mockResolvedValue(ORDER)
  })

  it('calls placeOrder with exactly the request body', async () => {
    const { result } = renderHook(() => usePlaceOrder(), {
      wrapper: wrapper(new QueryClient()),
    })

    await act(async () => {
      result.current.mutate({ symbol: 'BTC', side: 'buy', usd_amount: 100 })
    })

    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith({ symbol: 'BTC', side: 'buy', usd_amount: 100 }),
    )
  })

  it('toasts on success', async () => {
    const { result } = renderHook(() => usePlaceOrder(), {
      wrapper: wrapper(new QueryClient()),
    })

    await act(async () => {
      result.current.mutate({ symbol: 'BTC', side: 'buy', usd_amount: 100 })
    })

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(toastSuccess.mock.calls[0][0]).toContain('Bought')
  })

  it('invalidates both the portfolio and the advice caches', async () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => usePlaceOrder(), { wrapper: wrapper(client) })

    await act(async () => {
      result.current.mutate({ symbol: 'BTC', side: 'buy', usd_amount: 100 })
    })

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['portfolio'] }))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['advice'] })
  })

  it('runs the caller-supplied onSuccess callback', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() => usePlaceOrder({ onSuccess }), {
      wrapper: wrapper(new QueryClient()),
    })

    await act(async () => {
      result.current.mutate({ symbol: 'BTC', side: 'buy', usd_amount: 100 })
    })

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(ORDER))
  })

  it('runs the caller-supplied onError callback', async () => {
    placeOrder.mockRejectedValue(new Error('Not enough buying power'))
    const onError = vi.fn()
    const { result } = renderHook(() => usePlaceOrder({ onError }), {
      wrapper: wrapper(new QueryClient()),
    })

    await act(async () => {
      result.current.mutate({ symbol: 'BTC', side: 'buy', usd_amount: 100 })
    })

    await waitFor(() => expect(onError).toHaveBeenCalled())
    expect(onError.mock.calls[0][0].message).toBe('Not enough buying power')
  })

  it('says Sold for a sell order', async () => {
    placeOrder.mockResolvedValue({ ...ORDER, side: 'sell' })
    const { result } = renderHook(() => usePlaceOrder(), {
      wrapper: wrapper(new QueryClient()),
    })

    await act(async () => {
      result.current.mutate({ symbol: 'BTC', side: 'sell', usd_amount: 100 })
    })

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(toastSuccess.mock.calls[0][0]).toContain('Sold')
  })
})
