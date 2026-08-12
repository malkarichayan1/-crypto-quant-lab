import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLeaderboard } from './leaderboard'
import { getNews } from './news'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(body: unknown) {
  const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('getNews', () => {
  it('requests /news', async () => {
    const spy = stubFetch({ items: [], stale: false, fetched_at: '2026-08-08T12:00:00Z' })

    await getNews()

    expect(spy.mock.calls[0][0]).toMatch(/\/news$/)
  })

  it('returns the parsed items', async () => {
    stubFetch({
      items: [{ title: 'T', source: 'S', url: 'https://x.test', published_at: null }],
      stale: false,
      fetched_at: '2026-08-08T12:00:00Z',
    })

    const result = await getNews()

    expect(result.items[0].title).toBe('T')
  })
})

describe('getLeaderboard', () => {
  it('requests /leaderboard', async () => {
    const spy = stubFetch({ rows: [], stale: false })

    await getLeaderboard()

    expect(spy.mock.calls[0][0]).toMatch(/\/leaderboard$/)
  })
})
