import { describe, expect, it } from 'vitest'
import { formatPct, formatNum, signClass, METRIC_LABELS } from './format'

describe('formatPct', () => {
  it('renders a fraction as a signed percentage', () => {
    expect(formatPct(0.6421)).toBe('+64.21%')
    expect(formatPct(-0.18)).toBe('-18.00%')
  })
})

describe('formatNum', () => {
  it('rounds to two decimals', () => {
    expect(formatNum(1.4239)).toBe('1.42')
  })
})

describe('signClass', () => {
  it('classifies positive and negative values', () => {
    expect(signClass(0.1)).toBe('pos')
    expect(signClass(-0.1)).toBe('neg')
    expect(signClass(0)).toBe('pos')
  })
})

describe('METRIC_LABELS', () => {
  it('maps the sharpe key to a human label', () => {
    expect(METRIC_LABELS.sharpe).toBe('Sharpe')
  })
})
