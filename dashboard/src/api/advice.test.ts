import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateAdvice, getAdvice } from './advice'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(body: unknown) {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

const PAYLOAD = {
  enabled: true,
  advice: {
    suggestions: [{ text: 'Buy BTC', why: 'Oversold', action: null }],
    disclaimer: 'Simulated learning advice — not financial advice.',
    source: 'llm',
  },
}

describe('getAdvice', () => {
  it('requests the portfolio scope when no symbol is given', async () => {
    const spy = stubFetch(PAYLOAD)

    await getAdvice()

    expect(spy.mock.calls[0][0]).toMatch(/\/advice$/)
  })

  it('appends the symbol query when one is given', async () => {
    const spy = stubFetch(PAYLOAD)

    await getAdvice('BTC')

    expect(spy.mock.calls[0][0]).toMatch(/\/advice\?symbol=BTC$/)
  })

  it('returns the parsed body', async () => {
    stubFetch(PAYLOAD)

    const result = await getAdvice()

    expect(result.advice?.suggestions[0].text).toBe('Buy BTC')
  })
})

describe('generateAdvice', () => {
  it('POSTs to the advice endpoint', async () => {
    const spy = stubFetch(PAYLOAD)

    await generateAdvice()

    expect(spy.mock.calls[0][1]?.method).toBe('POST')
  })

  it('appends the symbol query when one is given', async () => {
    const spy = stubFetch(PAYLOAD)

    await generateAdvice('ETH')

    expect(spy.mock.calls[0][0]).toMatch(/\/advice\?symbol=ETH$/)
  })
})
