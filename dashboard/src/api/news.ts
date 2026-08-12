import { apiFetch } from './client'
import type { NewsResponse } from '../types'

export function getNews(): Promise<NewsResponse> {
  return apiFetch<NewsResponse>('/news')
}
