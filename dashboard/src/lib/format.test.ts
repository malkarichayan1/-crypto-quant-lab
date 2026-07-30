import { describe, expect, it } from 'vitest'
import { formatPct, formatNum, signClass, METRIC_LABELS, formatUsd } from './format'

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

describe('formatUsd', () => {
  it('formats dollars with grouping and two decimals', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50')
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(-50)).toBe('-$50.00')
  })
})
