import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('apiFetch', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ))
    const data = await apiFetch<{ ok: boolean }>('/health')
    expect(data.ok).toBe(true)
  })

  it('throws with the API detail message on error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'bad spec' }), { status: 422 }),
    ))
    await expect(apiFetch('/backtests')).rejects.toThrow('bad spec')
  })

  it('throws a generic message when the body has no detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('not json', { status: 500 }),
    ))
    await expect(apiFetch('/backtests')).rejects.toThrow('HTTP 500')
  })
})
