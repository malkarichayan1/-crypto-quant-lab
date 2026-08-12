import { apiFetch } from './client'
import type { LeaderboardResponse } from '../types'

export function getLeaderboard(): Promise<LeaderboardResponse> {
  return apiFetch<LeaderboardResponse>('/leaderboard')
}
