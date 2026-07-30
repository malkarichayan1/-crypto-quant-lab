import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'

type Props = {
  data: number[]
  isPositive: boolean
}

export function Sparkline({ data, isPositive }: Props) {
  const points = data.map((value, index) => ({ index, value }))
  return (
    <div className="h-8 w-24" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            dataKey="value"
            stroke={isPositive ? 'var(--color-profit)' : 'var(--color-loss)'}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
