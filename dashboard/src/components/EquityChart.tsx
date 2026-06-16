import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BacktestResult } from '../types'

type Props = {
  result: BacktestResult
}

export function EquityChart({ result }: Props) {
  const benchByDate = new Map(result.benchmark_curve ?? [])
  const data = result.equity_curve.map(([date, value]) => ({
    date,
    equity: value,
    benchmark: benchByDate.get(date) ?? null,
  }))

  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" />
        <XAxis dataKey="date" stroke="#aaa" minTickGap={40} />
        <YAxis stroke="#aaa" domain={['auto', 'auto']} width={70} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3a' }}
        />
        <Line
          type="monotone"
          dataKey="equity"
          stroke="#7c6fff"
          strokeWidth={2}
          dot={false}
          name="Equity"
        />
        {result.benchmark_curve && (
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke="#888"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="Benchmark"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
