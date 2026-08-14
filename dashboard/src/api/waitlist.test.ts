import { afterEach, describe, expect, it, vi } from 'vitest'
import { joinWaitlist } from './waitlist'

describe('joinWaitlist', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs the email and honeypot field to /waitlist', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await joinWaitlist('person@example.com', '')

    expect(result).toEqual({ status: 'ok' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/waitlist$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ email: 'person@example.com', company: '' })
  })
})
