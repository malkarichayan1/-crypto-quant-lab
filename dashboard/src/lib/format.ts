export function formatPct(fraction: number): string {
  const pct = fraction * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

export function formatNum(value: number): string {
  return value.toFixed(2)
}

export function signClass(value: number): 'pos' | 'neg' {
  return value >= 0 ? 'pos' : 'neg'
}

export const METRIC_LABELS: Record<string, string> = {
  total_return: 'Total Return',
  cagr: 'CAGR',
  ann_vol: 'Ann. Vol',
  sharpe: 'Sharpe',
  sortino: 'Sortino',
  max_drawdown: 'Max Drawdown',
  var_95: 'VaR 95',
  cvar_95: 'CVaR 95',
  beta: 'Beta',
  alpha: 'Alpha',
  tracking_error: 'Tracking Error',
  information_ratio: 'Info Ratio',
}

// Keys that should render as percentages rather than raw numbers.
export const PERCENT_METRICS = new Set([
  'total_return',
  'cagr',
  'ann_vol',
  'max_drawdown',
  'var_95',
  'cvar_95',
  'alpha',
  'tracking_error',
])

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export function formatUsd(value: number): string {
  return usdFormatter.format(value)
}
