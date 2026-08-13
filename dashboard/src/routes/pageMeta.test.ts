import { describe, expect, it } from 'vitest'
import { APP_PAGE_META } from './pageMeta'

describe('APP_PAGE_META', () => {
  it('has a non-empty title and description for every entry', () => {
    for (const entry of APP_PAGE_META) {
      expect(entry.title.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate patterns', () => {
    const patterns = APP_PAGE_META.map((e) => e.pattern)
    expect(new Set(patterns).size).toBe(patterns.length)
  })

  it('covers every real /app route from App.tsx', () => {
    const expected = [
      '/app',
      '/app/markets',
      '/app/coins/:symbol',
      '/app/portfolio',
      '/app/leaderboard',
      '/app/news',
      '/app/settings',
      '/app/lab/backtests',
      '/app/lab/backtests/history',
      '/app/lab/backtests/:id',
      '/app/lab/research',
      '/app/lab/research/history',
      '/app/lab/research/runs/:id',
      '/app/lab/paper',
      '/app/lab/paper/history',
      '/app/lab/paper/sessions/:id',
    ]
    const patterns = APP_PAGE_META.map((e) => e.pattern)
    for (const route of expected) {
      expect(patterns).toContain(route)
    }
  })
})
