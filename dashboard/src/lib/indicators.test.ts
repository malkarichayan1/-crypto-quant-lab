import { describe, expect, it } from 'vitest'
import { rsi, sma } from './indicators'

describe('sma', () => {
  it('returns null until the window fills, then rolling means', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5])
  })

  it('handles period longer than the series', () => {
    expect(sma([1, 2], 5)).toEqual([null, null])
  })
})

describe('rsi', () => {
  it('is 100 when every move is a gain', () => {
    const result = rsi([1, 2, 3, 4, 5], 2)
    expect(result[4]).toBe(100)
  })

  it('is 0 when every move is a loss', () => {
    const result = rsi([5, 4, 3, 2, 1], 2)
    expect(result[4]).toBe(0)
  })

  it('is null before the window fills', () => {
    const result = rsi([1, 2, 3, 4, 5], 3)
    expect(result.slice(0, 3)).toEqual([null, null, null])
  })

  it('computes the classic formula for mixed moves', () => {
    // deltas: +1, -0.5 → avg gain 0.5, avg loss 0.25 → RS 2 → RSI 66.67
    const result = rsi([10, 11, 10.5], 2)
    expect(result[2]).toBeCloseTo(66.6667, 3)
  })
})
