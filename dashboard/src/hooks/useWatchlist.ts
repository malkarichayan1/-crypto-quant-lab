import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getWatchlist, starSymbol, unstarSymbol } from '../api/watchlist'
import type { WatchlistResponse } from '../types'

export function useWatchlist() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['watchlist'], queryFn: getWatchlist })
  const starred = new Set(data?.symbols ?? [])

  const applyResult = (result: WatchlistResponse) =>
    queryClient.setQueryData(['watchlist'], result)

  const star = useMutation({ mutationFn: (symbol: string) => starSymbol(symbol), onSuccess: applyResult })
  const unstar = useMutation({ mutationFn: (symbol: string) => unstarSymbol(symbol), onSuccess: applyResult })

  const toggle = (symbol: string) => {
    if (starred.has(symbol)) {
      unstar.mutate(symbol)
    } else {
      star.mutate(symbol)
    }
  }

  return { starred, toggle }
}
