import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAssetCandles, getMarketAssets } from './market'

function okJson(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
}

describe('market api', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches the assets list', async () => {
    const fetchMock = vi.fn(() => okJson({ assets: [], stale: false, as_of: 'x' }))
    vi.stubGlobal('fetch', fetchMock)
    await getMarketAssets()
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/market/assets', undefined)
  })

  it('fetches candles with symbol and range', async () => {
    const fetchMock = vi.fn(() => okJson({ symbol: 'BTC', range: '1W', candles: [], stale: false }))
    vi.stubGlobal('fetch', fetchMock)
    await getAssetCandles('BTC', '1W')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/market/assets/BTC/candles?range=1W',
      undefined,
    )
  })
})
