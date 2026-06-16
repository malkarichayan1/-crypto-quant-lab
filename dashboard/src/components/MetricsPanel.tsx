import {
  METRIC_LABELS,
  PERCENT_METRICS,
  formatNum,
  formatPct,
  signClass,
} from '../lib/format'

type Props = {
  metrics: Record<string, number>
}

export function MetricsPanel({ metrics }: Props) {
  const rows = Object.keys(METRIC_LABELS).filter((key) => key in metrics)

  return (
    <div className="metrics-panel">
      <h3>Metrics</h3>
      {rows.map((key) => {
        const value = metrics[key]
        const isPct = PERCENT_METRICS.has(key)
        const display = isPct ? formatPct(value) : formatNum(value)
        const cls = isPct ? signClass(value) : ''
        return (
          <div className="metric-row" key={key}>
            <span className="metric-label">{METRIC_LABELS[key]}</span>
            <span className={`metric-value ${cls}`}>{display}</span>
          </div>
        )
      })}
    </div>
  )
}
