import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PriceChart } from './PriceChart'
import type { Candle } from '../types'

const addSeries = vi.fn((..._args: unknown[]) => ({ setData: vi.fn() }))
const chartMock = {
  addSeries,
  timeScale: () => ({ fitContent: vi.fn() }),
  remove: vi.fn(),
}

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => chartMock),
  AreaSeries: 'AreaSeries',
  CandlestickSeries: 'CandlestickSeries',
  HistogramSeries: 'HistogramSeries',
  LineSeries: 'LineSeries',
}))

function makeCandles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    ts: new Date(Date.UTC(2026, 6, 1, i)).toISOString(),
    open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 10,
  }))
}

describe('PriceChart', () => {
  beforeEach(() => addSeries.mockClear())

  it('renders one area series in line mode', () => {
    render(<PriceChart candles={makeCandles(30)} mode="line" />)
    expect(addSeries).toHaveBeenCalledTimes(1)
    expect(addSeries.mock.calls[0][0]).toBe('AreaSeries')
  })

  it('renders candles, sma, volume, and rsi series in pro mode', () => {
    render(<PriceChart candles={makeCandles(30)} mode="pro" />)
    expect(addSeries).toHaveBeenCalledTimes(4)
    const seriesTypes = addSeries.mock.calls.map((call) => call[0])
    expect(seriesTypes).toEqual([
      'CandlestickSeries',
      'LineSeries',
      'HistogramSeries',
      'LineSeries',
    ])
  })

  it('renders nothing chart-wise with no candles', () => {
    render(<PriceChart candles={[]} mode="line" />)
    expect(addSeries).not.toHaveBeenCalled()
  })
})
