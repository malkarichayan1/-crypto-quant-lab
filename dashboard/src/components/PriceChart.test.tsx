import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PriceChart } from './PriceChart'
import type { Candle } from '../types'

// Each addSeries() call gets its own setData spy, in call order, so tests
// can tell which series (area / candle / sma / volume / rsi) received which
// data without the mock itself knowing about series types.
// vi.mock factories are hoisted above imports, so these mocks must be built
// via vi.hoisted() — a plain top-level const here would be read before its
// own initializer runs (TDZ) the moment `lightweight-charts` is imported.
const { addSeries, chartRemove, createChart, seriesSetDataSpies } = vi.hoisted(() => {
  const spies: ReturnType<typeof vi.fn>[] = []
  const addSeriesMock = vi.fn((..._args: unknown[]) => {
    const setData = vi.fn()
    spies.push(setData)
    return { setData }
  })
  const chartRemoveMock = vi.fn()
  const chartMock = {
    addSeries: addSeriesMock,
    timeScale: () => ({ fitContent: vi.fn() }),
    remove: chartRemoveMock,
  }
  return {
    addSeries: addSeriesMock,
    chartRemove: chartRemoveMock,
    createChart: vi.fn(() => chartMock),
    seriesSetDataSpies: spies,
  }
})

vi.mock('lightweight-charts', () => ({
  createChart,
  AreaSeries: 'AreaSeries',
  CandlestickSeries: 'CandlestickSeries',
  HistogramSeries: 'HistogramSeries',
  LineSeries: 'LineSeries',
}))

function makeCandles(n: number, hourOffset = 0): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    ts: new Date(Date.UTC(2026, 6, 1, i + hourOffset)).toISOString(),
    open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 10,
  }))
}

describe('PriceChart', () => {
  beforeEach(() => {
    addSeries.mockClear()
    createChart.mockClear()
    chartRemove.mockClear()
    seriesSetDataSpies.length = 0
  })

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

  it('pushes new candles into the existing series via setData, without recreating the chart', () => {
    const initial = makeCandles(30)
    const { rerender } = render(<PriceChart candles={initial} mode="line" />)

    expect(createChart).toHaveBeenCalledTimes(1)
    expect(addSeries).toHaveBeenCalledTimes(1)
    const [areaSetData] = seriesSetDataSpies
    expect(areaSetData).toHaveBeenCalledTimes(1)

    // Simulate a 30s poll tick: a fresh array reference with new data.
    const polled = makeCandles(31, 1)
    rerender(<PriceChart candles={polled} mode="line" />)

    // No rebuild: still just the one chart and one series ever created.
    expect(createChart).toHaveBeenCalledTimes(1)
    expect(addSeries).toHaveBeenCalledTimes(1)
    expect(chartRemove).not.toHaveBeenCalled()

    // But the existing series receives the new data.
    expect(areaSetData).toHaveBeenCalledTimes(2)
    expect(areaSetData).toHaveBeenLastCalledWith(
      polled.map((c) => expect.objectContaining({ value: c.close })),
    )
  })

  it('tears down and rebuilds when mode changes, even though a chart already exists', () => {
    const candles = makeCandles(30)
    const { rerender } = render(<PriceChart candles={candles} mode="line" />)

    expect(createChart).toHaveBeenCalledTimes(1)
    expect(addSeries).toHaveBeenCalledTimes(1)

    rerender(<PriceChart candles={candles} mode="pro" />)

    expect(chartRemove).toHaveBeenCalledTimes(1)
    expect(createChart).toHaveBeenCalledTimes(2)
    // 1 area series from line mode + 4 series from the pro rebuild.
    expect(addSeries).toHaveBeenCalledTimes(5)
    const seriesTypes = addSeries.mock.calls.slice(1).map((call) => call[0])
    expect(seriesTypes).toEqual([
      'CandlestickSeries',
      'LineSeries',
      'HistogramSeries',
      'LineSeries',
    ])
  })
})
