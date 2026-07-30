import { apiFetch } from './client'
import type { WatchlistResponse } from '../types'

export function getWatchlist(): Promise<WatchlistResponse> {
  return apiFetch<WatchlistResponse>('/watchlist')
}

export function starSymbol(symbol: string): Promise<WatchlistResponse> {
  return apiFetch<WatchlistResponse>(`/watchlist/${symbol}`, { method: 'PUT' })
}

export function unstarSymbol(symbol: string): Promise<WatchlistResponse> {
  return apiFetch<WatchlistResponse>(`/watchlist/${symbol}`, { method: 'DELETE' })
}
