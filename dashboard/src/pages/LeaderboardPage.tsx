import { useQuery } from '@tanstack/react-query'
import { Bot, Trophy, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getLeaderboard } from '../api/leaderboard'
import { Sparkline } from '../components/Sparkline'
import { formatPct, formatUsd } from '../lib/format'
import type { LeaderboardRow } from '../types'

const POLL_INTERVAL_MS = 60_000

const KIND_ICON = { you: User, ai: Bot, benchmark: Trophy } as const

function formatStartDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function Row({ row, rank }: { row: LeaderboardRow; rank: number }) {
  const Icon = KIND_ICON[row.kind]
  const isPositive = row.total_return_pct >= 0

  return (
    <Card className={cn(row.kind === 'you' && 'border-primary/40 bg-primary/[0.03]')}>
      <CardContent className="flex items-center gap-4 p-4">
        <span className="w-5 text-sm tabular-nums text-muted-foreground">{rank}</span>

        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{row.label}</span>
          <span className="block text-xs text-muted-foreground">
            since {formatStartDate(row.start_date)}
          </span>
        </span>

        <span className="hidden w-24 sm:block">
          <Sparkline data={row.sparkline} isPositive={isPositive} />
        </span>

        <span className="w-28 text-right text-sm tabular-nums">{formatUsd(row.equity)}</span>

        <span
          className={cn(
            'w-24 text-right text-sm font-medium tabular-nums',
            isPositive ? 'text-profit' : 'text-loss',
          )}
        >
          {formatPct(row.total_return_pct)}
        </span>
      </CardContent>
    </Card>
  )
}

export function LeaderboardPage() {
  const query = useQuery({
    queryKey: ['leaderboard'],
    queryFn: getLeaderboard,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const failed = query.isError && !query.data
  const rows = query.data?.rows ?? []

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold">Leaderboard</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Your portfolio against the AI strategies and buy-and-hold Bitcoin. Participants
        have different start dates, so returns are not strictly comparable.
      </p>

      {failed && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">We couldn't load the leaderboard.</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {query.isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      )}

      {!failed && !query.isLoading && rows.length === 0 && (
        <p className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          Nothing to compare yet — make a trade or start a paper session in the Lab.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <Row key={`${row.kind}-${row.label}`} row={row} rank={index + 1} />
        ))}
      </div>
    </div>
  )
}
