import { apiFetch } from './client'
import type {
  EquityRange,
  EquitySeriesResponse,
  ManualOrder,
  PlaceOrderRequest,
  PortfolioSummary,
} from '../types'

export function getPortfolio(): Promise<PortfolioSummary> {
  return apiFetch<PortfolioSummary>('/portfolio')
}

export function getPortfolioOrders(): Promise<ManualOrder[]> {
  return apiFetch<ManualOrder[]>('/portfolio/orders')
}

export function getPortfolioEquity(range: EquityRange): Promise<EquitySeriesResponse> {
  return apiFetch<EquitySeriesResponse>(`/portfolio/equity?range=${range}`)
}

export function placeOrder(body: PlaceOrderRequest): Promise<ManualOrder> {
  return apiFetch<ManualOrder>('/portfolio/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
