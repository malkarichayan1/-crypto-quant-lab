export function sma(values: number[], period: number): (number | null)[] {
  return values.map((_, index) => {
    if (index < period - 1) return null
    const window = values.slice(index - period + 1, index + 1)
    return window.reduce((sum, value) => sum + value, 0) / period
  })
}

export function rsi(values: number[], period: number): (number | null)[] {
  const deltas = values.map((value, index) =>
    index === 0 ? 0 : value - values[index - 1],
  )
  return values.map((_, index) => {
    if (index < period) return null
    const window = deltas.slice(index - period + 1, index + 1)
    const avgGain = window.reduce((sum, d) => sum + Math.max(d, 0), 0) / period
    const avgLoss = window.reduce((sum, d) => sum + Math.max(-d, 0), 0) / period
    if (avgLoss === 0 && avgGain === 0) return null
    if (avgLoss === 0) return 100
    const rs = avgGain / avgLoss
    return 100 - 100 / (1 + rs)
  })
}
