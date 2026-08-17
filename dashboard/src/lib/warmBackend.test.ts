import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../api/config'

// warmBackend keeps a module-level "already fired" flag, so every test needs a
// fresh module instance rather than a test-only reset export.
async function importFresh() {
  vi.resetModules()
  return import('./warmBackend')
}

describe('warmBackend', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pings the health endpoint on the configured API base URL', async () => {
    const { warmBackend } = await importFresh()

    warmBackend()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/health`)
  })

  it('bypasses the HTTP cache so the ping always reaches the origin', async () => {
    const { warmBackend } = await importFresh()

    warmBackend()

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })
  })

  it('only pings once however many times it is called', async () => {
    const { warmBackend } = await importFresh()

    warmBackend()
    warmBackend()
    warmBackend()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('swallows network errors instead of rejecting', async () => {
    // mockImplementation, not mockReturnValue: the latter would build the
    // rejected promise here and leave it unhandled across the await below,
    // tripping an unhandled-rejection error before warmBackend ever runs.
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')))
    const { warmBackend } = await importFresh()

    expect(() => warmBackend()).not.toThrow()
    // Flush the microtask queue — an unhandled rejection here would fail the run.
    await Promise.resolve()
  })
})
