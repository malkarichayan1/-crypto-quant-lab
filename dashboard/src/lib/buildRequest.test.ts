import { describe, expect, it } from 'vitest'
import { buildCreateRequest, indicatorToApi } from './buildRequest'
import { INITIAL_FORM_STATE } from '../components/spec-form/types'
import type { SpecFormState } from '../components/spec-form/types'

describe('indicatorToApi', () => {
  it('uses lookback for momentum and volatility', () => {
    expect(indicatorToApi({ type: 'momentum', id: 'm1', param: 20, sourceId: '' }))
      .toEqual({ type: 'momentum', id: 'm1', lookback: 20 })
    expect(indicatorToApi({ type: 'volatility', id: 'v1', param: 30, sourceId: '' }))
      .toEqual({ type: 'volatility', id: 'v1', lookback: 30 })
  })

  it('uses period for sma and rsi', () => {
    expect(indicatorToApi({ type: 'sma', id: 's1', param: 50, sourceId: '' }))
      .toEqual({ type: 'sma', id: 's1', period: 50 })
    expect(indicatorToApi({ type: 'rsi', id: 'r1', param: 14, sourceId: '' }))
      .toEqual({ type: 'rsi', id: 'r1', period: 14 })
  })

  it('uses source_id and lookback for zscore', () => {
    expect(indicatorToApi({ type: 'zscore', id: 'z1', param: 10, sourceId: 'm1' }))
      .toEqual({ type: 'zscore', id: 'z1', source_id: 'm1', lookback: 10 })
  })
})

describe('buildCreateRequest', () => {
  it('builds a valid cross-sectional request from the initial state', () => {
    const state: SpecFormState = {
      ...INITIAL_FORM_STATE,
      name: 'momentum_2024',
      universe: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    }
    const req = buildCreateRequest(state)
    expect(req.starting_cash).toBe(10000)
    expect(req.spec).toMatchObject({
      name: 'momentum_2024',
      universe: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      indicators: [{ type: 'momentum', id: 'm1', lookback: 20 }],
      selection: {
        mode: 'cross_sectional',
        rank_by: 'm1',
        long_top: 3,
        short_bottom: 0,
      },
      rebalance: 'daily',
      costs: { fee_bps: 10, slippage_bps: 5 },
      start: '2021-01-01',
      end: '2024-12-31',
      benchmark: 'BTC/USDT',
    })
  })

  it('omits vol_indicator_id unless the scheme is inverse_vol', () => {
    const eq = buildCreateRequest({ ...INITIAL_FORM_STATE, name: 'x', universe: ['BTC/USDT'] })
    expect((eq.spec.sizing as Record<string, unknown>).vol_indicator_id).toBeUndefined()

    const iv = buildCreateRequest({
      ...INITIAL_FORM_STATE,
      name: 'x',
      universe: ['BTC/USDT'],
      sizingScheme: 'inverse_vol',
      volIndicatorId: 'v1',
    })
    expect((iv.spec.sizing as Record<string, unknown>).vol_indicator_id).toBe('v1')
  })
})
