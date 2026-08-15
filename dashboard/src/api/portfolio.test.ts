import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPortfolio, placeOrder } from './portfolio'

function okJson(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
}

describe('portfolio api', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches the portfolio summary', async () => {
    const fetchMock = vi.fn(() => okJson({}))
    vi.stubGlobal('fetch', fetchMock)
    await getPortfolio()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/portfolio',
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
  })

  it('posts an order as JSON', async () => {
    const fetchMock = vi.fn(() => okJson({}))
    vi.stubGlobal('fetch', fetchMock)
    await placeOrder({ symbol: 'BTC', side: 'buy', usd_amount: 250 })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/portfolio/orders',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ symbol: 'BTC', side: 'buy', usd_amount: 250 }),
      }),
    )
  })
})
