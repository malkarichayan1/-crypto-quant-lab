import { useEffect, useRef } from 'react'
import {
  AreaSeries,
  CandlestickSeries,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
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
const VOLUME_PANE_INDEX = 1
const RSI_PANE_INDEX = 2

const COLORS = {
  accent: '#3b82f6',
  profit: '#22c55e',
  loss: '#ef4444',
  watch: '#f59e0b',
  muted: '#8b93a7',
  border: '#232838',
}

type LineChartSeries = { mode: 'line'; area: ISeriesApi<'Area'> }
type ProChartSeries = {
  mode: 'pro'
  candle: ISeriesApi<'Candlestick'>
  sma: ISeriesApi<'Line'>
  volume: ISeriesApi<'Histogram'>
  rsi: ISeriesApi<'Line'>
}
type ChartSeries = LineChartSeries | ProChartSeries

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

function areaData(candles: Candle[]) {
  return candles.map((c) => ({ time: toTime(c.ts), value: c.close }))
}

function candlestickData(candles: Candle[]) {
  return candles.map((c) => ({
    time: toTime(c.ts), open: c.open, high: c.high, low: c.low, close: c.close,
  }))
}

function volumeData(candles: Candle[]) {
  return candles.map((c) => ({ time: toTime(c.ts), value: c.volume }))
}

function smaData(candles: Candle[]) {
  return indicatorData(candles, sma(candles.map((c) => c.close), SMA_PERIOD))
}

function rsiData(candles: Candle[]) {
  return indicatorData(candles, rsi(candles.map((c) => c.close), RSI_PERIOD))
}

/** Create the series structure for a mode. Does not populate data. */
function buildSeries(chart: IChartApi, mode: 'line' | 'pro'): ChartSeries {
  if (mode === 'line') {
    const area = chart.addSeries(AreaSeries, {
      lineColor: COLORS.accent,
      topColor: 'rgba(59, 130, 246, 0.25)',
      bottomColor: 'rgba(59, 130, 246, 0)',
      lineWidth: 2,
    })
    return { mode, area }
  }

  const candle = chart.addSeries(CandlestickSeries, {
    upColor: COLORS.profit,
    downColor: COLORS.loss,
    wickUpColor: COLORS.profit,
    wickDownColor: COLORS.loss,
    borderVisible: false,
  })
  const smaSeries = chart.addSeries(LineSeries, {
    color: COLORS.watch,
    lineWidth: 1,
    priceLineVisible: false,
  })
  const volumeSeries = chart.addSeries(
    HistogramSeries,
    { color: 'rgba(139, 147, 167, 0.4)', priceFormat: { type: 'volume' } },
    VOLUME_PANE_INDEX,
  )
  const rsiSeries = chart.addSeries(
    LineSeries,
    { color: COLORS.accent, lineWidth: 1, priceLineVisible: false },
    RSI_PANE_INDEX,
  )
  return { mode, candle, sma: smaSeries, volume: volumeSeries, rsi: rsiSeries }
}

/** Push the latest candles into an already-created chart's series (no rebuild). */
function updateSeriesData(series: ChartSeries, candles: Candle[]) {
  if (series.mode === 'line') {
    series.area.setData(areaData(candles))
    return
  }
  series.candle.setData(candlestickData(candles))
  series.sma.setData(smaData(candles))
  series.volume.setData(volumeData(candles))
  series.rsi.setData(rsiData(candles))
}

export function PriceChart({ candles, mode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ChartSeries | null>(null)

  // Drives both chart creation and data updates from one effect. It only
  // rebuilds (createChart + addSeries + fitContent) the first time a chart
  // is needed and whenever `mode` changes — the only cases where the series
  // structure itself must change. A `candles` update alone (e.g. a 30s poll
  // tick) takes the cheap path: push the new data into the already-created
  // series via setData() and stop. That keeps the user's zoom/pan intact
  // and avoids a visible rebuild/flicker on every refetch.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (candles.length === 0) {
      chartRef.current?.remove()
      chartRef.current = null
      seriesRef.current = null
      return
    }

    const needsRebuild =
      !chartRef.current || !seriesRef.current || seriesRef.current.mode !== mode
    if (needsRebuild) {
      chartRef.current?.remove()

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
      const series = buildSeries(chart, mode)
      updateSeriesData(series, candles)
      chart.timeScale().fitContent()

      chartRef.current = chart
      seriesRef.current = series
      return
    }

    if (seriesRef.current) {
      updateSeriesData(seriesRef.current, candles)
    }
  }, [candles, mode])

  // Unmount cleanup — mode/candles changes are handled above via refs.
  useEffect(() => {
    return () => {
      chartRef.current?.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  return (
    <div
      ref={containerRef}
      data-testid="price-chart"
      className="h-[360px] w-full"
    />
  )
}
