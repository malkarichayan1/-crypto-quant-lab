import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { placeOrder } from '../api/portfolio'
import { formatUsd } from '../lib/format'
import type { ManualOrder, PlaceOrderRequest } from '../types'

type Options = {
  onSuccess?: (order: ManualOrder) => void
  onError?: (error: Error) => void
}

/**
 * The single place an order gets placed from the UI.
 *
 * Both the order ticket and the advisor's one-tap accept route through here so
 * the toast copy, the Portfolio deep link, and the cache invalidation cannot
 * drift apart. `['advice']` is invalidated alongside `['portfolio']` because
 * the server drops cached advice on every fill.
 */
export function usePlaceOrder(options: Options = {}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    // Wrapped rather than passed by reference: react-query v5 calls
    // mutationFn(variables, context), and that extra arg leaks into assertions.
    mutationFn: (body: PlaceOrderRequest) => placeOrder(body),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      queryClient.invalidateQueries({ queryKey: ['advice'] })
      const verb = order.side === 'buy' ? 'Bought' : 'Sold'
      toast.success(`${verb} ${formatUsd(order.usd_amount)} of ${order.symbol} ✓`, {
        action: { label: 'Portfolio', onClick: () => navigate('/app/portfolio') },
      })
      options.onSuccess?.(order)
    },
    onError: (error: Error) => {
      options.onError?.(error)
    },
  })
}
