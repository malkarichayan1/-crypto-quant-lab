import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPaperSessions, createPaperSession } from './paperSessions'

beforeEach(() => { vi.restoreAllMocks() })

describe('paperSessions api', () => {
  it('listPaperSessions GETs the collection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)
    await listPaperSessions()
    expect(fetchMock.mock.calls[0][0]).toContain('/paper-sessions')
  })

  it('createPaperSession POSTs the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: '1' }) })
    vi.stubGlobal('fetch', fetchMock)
    await createPaperSession({ label: 't', spec_json: { name: 'x' }, starting_cash: 1000 })
    const [, opts] = fetchMock.mock.calls[0]
    expect(opts.method).toBe('POST')
  })
})
