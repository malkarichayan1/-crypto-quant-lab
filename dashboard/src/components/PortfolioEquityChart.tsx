import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import type { EquityRange, ManualEquityPoint } from '../types'

const RANGES: EquityRange[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL']

type Props = {
  points: ManualEquityPoint[]
  range: EquityRange
  onRangeChange: (range: EquityRange) => void
}

export function PortfolioEquityChart({ points, range, onRangeChange }: Props) {
  const data = points.map((point) => ({
    ts: new Date(point.ts).toLocaleDateString(),
    equity: point.equity,
  }))
  return (
    <div>
      <div className="mb-2 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            onClick={() => onRangeChange(r)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200',
              range === r
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="ts" stroke="#8b93a7" minTickGap={60} fontSize={11} />
          <YAxis stroke="#8b93a7" domain={['auto', 'auto']} width={70} fontSize={11} />
          <Tooltip
            contentStyle={{ background: '#161925', border: '1px solid #232838' }}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#equityFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
