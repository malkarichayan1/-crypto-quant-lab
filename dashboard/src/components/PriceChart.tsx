import { useEffect, useRef } from 'react'
import {
  AreaSeries,
  CandlestickSeries,
  createChart,
  HistogramSeries,
  LineSeries,
  type UTCTimestamp,
} from 'lightweight-charts'
import { rsi, sma } from '../lib/indicators'
import type { Candle } from '../types'

type Props = {
  candles: Candle[]
  mode: 'line' | 'pro'
}

const CHART_HEIGHT = 360
const SMA_PERIOD = 20
const RSI_PERIOD = 14

const COLORS = {
  accent: '#3b82f6',
  profit: '#22c55e',
  loss: '#ef4444',
  watch: '#f59e0b',
  muted: '#8b93a7',
  border: '#232838',
}

function toTime(ts: string): UTCTimestamp {
  return Math.floor(Date.parse(ts) / 1000) as UTCTimestamp
}

/** Pair indicator values with candle times, skipping the unfilled window. */
function indicatorData(candles: Candle[], values: (number | null)[]) {
  return candles.flatMap((candle, index) =>
    values[index] === null
      ? []
      : [{ time: toTime(candle.ts), value: values[index] as number }],
  )
}

export function PriceChart({ candles, mode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || candles.length === 0) return

    const chart = createChart(container, {
      height: CHART_HEIGHT,
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: COLORS.muted },
      grid: {
        vertLines: { color: COLORS.border },
        horzLines: { color: COLORS.border },
      },
      timeScale: { borderColor: COLORS.border, timeVisible: true },
      rightPriceScale: { borderColor: COLORS.border },
    })

    if (mode === 'line') {
      const area = chart.addSeries(AreaSeries, {
        lineColor: COLORS.accent,
        topColor: 'rgba(59, 130, 246, 0.25)',
        bottomColor: 'rgba(59, 130, 246, 0)',
        lineWidth: 2,
      })
      area.setData(candles.map((c) => ({ time: toTime(c.ts), value: c.close })))
    } else {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: COLORS.profit,
        downColor: COLORS.loss,
        wickUpColor: COLORS.profit,
        wickDownColor: COLORS.loss,
        borderVisible: false,
      })
      candleSeries.setData(
        candles.map((c) => ({
          time: toTime(c.ts), open: c.open, high: c.high, low: c.low, close: c.close,
        })),
      )

      const closes = candles.map((c) => c.close)
      const smaSeries = chart.addSeries(LineSeries, {
        color: COLORS.watch,
        lineWidth: 1,
        priceLineVisible: false,
      })
      smaSeries.setData(indicatorData(candles, sma(closes, SMA_PERIOD)))

      const volumeSeries = chart.addSeries(
        HistogramSeries,
        { color: 'rgba(139, 147, 167, 0.4)', priceFormat: { type: 'volume' } },
        1,
      )
      volumeSeries.setData(candles.map((c) => ({ time: toTime(c.ts), value: c.volume })))

      const rsiSeries = chart.addSeries(
        LineSeries,
        { color: COLORS.accent, lineWidth: 1, priceLineVisible: false },
        2,
      )
      rsiSeries.setData(indicatorData(candles, rsi(closes, RSI_PERIOD)))
    }

    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [candles, mode])

  return (
    <div
      ref={containerRef}
      data-testid="price-chart"
      className="h-[360px] w-full"
    />
  )
}
