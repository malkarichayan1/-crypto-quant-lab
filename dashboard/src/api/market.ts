import { apiFetch } from './client'
import type { CandlesResponse, MarketAssetsResponse, TimeRange } from '../types'

export function getMarketAssets(): Promise<MarketAssetsResponse> {
  return apiFetch<MarketAssetsResponse>('/market/assets')
}

export function getAssetCandles(symbol: string, range: TimeRange): Promise<CandlesResponse> {
  return apiFetch<CandlesResponse>(`/market/assets/${symbol}/candles?range=${range}`)
}
