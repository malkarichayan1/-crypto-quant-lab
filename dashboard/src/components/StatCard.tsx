import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  value: string
  sub?: string
  tone?: 'profit' | 'loss' | 'neutral'
}

export function StatCard({ label, value, sub, tone = 'neutral' }: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
        {sub && (
          <p
            className={cn(
              'mt-0.5 text-xs tabular-nums',
              tone === 'profit' && 'text-profit',
              tone === 'loss' && 'text-loss',
              tone === 'neutral' && 'text-muted-foreground',
            )}
          >
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
