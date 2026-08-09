import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { generateAdvice, getAdvice } from '../api/advice'
import { useAdvisorEnabled } from '../hooks/useAdvisorEnabled'
import { usePlaceOrder } from '../hooks/usePlaceOrder'
import { formatUsd } from '../lib/format'
import type { AdviceResponse, SuggestionAction } from '../types'

type Props = {
  /** Omit for portfolio-wide advice; pass a base symbol for per-coin advice. */
  symbol?: string
}

export function AdvisorCard({ symbol }: Props) {
  const [pendingAction, setPendingAction] = useState<SuggestionAction | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const queryKey = ['advice', symbol ?? 'portfolio']
  const cached = useQuery({ queryKey, queryFn: () => getAdvice(symbol) })

  const generate = useMutation({
    mutationFn: () => generateAdvice(symbol),
    onSuccess: (data: AdviceResponse) => {
      queryClient.setQueryData(queryKey, data)
      // A refreshed suggestion set may not even have an item at the previously
      // expanded index — never let unrelated "why" text render pre-expanded.
      setExpanded(null)
    },
  })

  // Opening/closing the review dialog always clears any previous order error
  // so a stale failure message never bleeds into the next suggestion's review.
  const openReview = (action: SuggestionAction) => {
    setOrderError(null)
    setPendingAction(action)
  }
  const closeReview = () => {
    setOrderError(null)
    setPendingAction(null)
  }

  const placeOrder = usePlaceOrder({
    onSuccess: closeReview,
    // Money-moving action: on failure, keep the dialog open and show why —
    // never fail silently, never auto-close so the user can see the error.
    onError: (error) => setOrderError(error.message),
  })

  const userEnabled = useAdvisorEnabled()

  if (cached.isLoading) return <Skeleton className="h-40 rounded-xl" />
  // A disabled advisor renders nothing at all rather than an explanatory box —
  // the kill switch exists to remove the surface, not to advertise it. Both the
  // user's local preference and the server-side kill switch independently hide it.
  if (!userEnabled || cached.data?.enabled === false) return null

  const advice = cached.data?.advice ?? null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          Advisor{symbol ? `'s take on ${symbol}` : ''}
        </CardTitle>
        {advice && (
          <Button
            variant="ghost"
            size="sm"
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? 'Thinking…' : 'Refresh'}
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {!advice && !generate.isError && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Get plain-English suggestions based on your portfolio and current signals.
            </p>
            <Button
              size="sm"
              disabled={generate.isPending}
              onClick={() => generate.mutate()}
              className="transition-transform duration-200 active:scale-[0.98]"
            >
              {generate.isPending ? 'Thinking…' : 'Get advice'}
            </Button>
          </div>
        )}

        {generate.isError && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              We couldn't generate advice just now.
            </p>
            <Button variant="outline" size="sm" onClick={() => generate.mutate()}>
              Try again
            </Button>
          </div>
        )}

        {advice && advice.suggestions.length === 0 && (
          <p className="text-sm text-muted-foreground">No suggestions right now.</p>
        )}

        {advice?.suggestions.map((suggestion, index) => (
          <div
            key={index}
            className="flex flex-col gap-1.5 border-t border-border pt-3 first:border-0 first:pt-0"
          >
            <p className="text-sm">{suggestion.text}</p>

            <button
              type="button"
              id={`why-toggle-${index}`}
              onClick={() => setExpanded(expanded === index ? null : index)}
              aria-expanded={expanded === index}
              aria-controls={`why-content-${index}`}
              className="self-start text-xs text-primary transition-colors duration-200 hover:underline"
            >
              Why?
            </button>
            {expanded === index && (
              <p id={`why-content-${index}`} className="text-xs text-muted-foreground">
                {suggestion.why}
              </p>
            )}

            {suggestion.action && (
              <Button
                size="sm"
                onClick={() => openReview(suggestion.action!)}
                className={cn(
                  'mt-1 self-start transition-transform duration-200 active:scale-[0.98]',
                  suggestion.action.side === 'buy'
                    ? 'bg-profit text-white hover:bg-profit/90'
                    : 'bg-loss text-white hover:bg-loss/90',
                )}
              >
                <span className="capitalize">{suggestion.action.side}</span>{' '}
                {formatUsd(suggestion.action.usd_amount)} of {suggestion.action.symbol}
              </Button>
            )}
          </div>
        ))}

        {advice?.source === 'template' && (
          <p className="text-xs text-muted-foreground/70">
            Generated without the AI — showing signal-based guidance instead.
          </p>
        )}

        {advice && (
          <p className="border-t border-border pt-2 text-xs text-muted-foreground/70">
            {advice.disclaimer}
          </p>
        )}
      </CardContent>

      <Dialog open={pendingAction !== null} onOpenChange={(open) => !open && closeReview()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {pendingAction?.side} {formatUsd(pendingAction?.usd_amount ?? 0)} of{' '}
              {pendingAction?.symbol}
            </DialogTitle>
            <DialogDescription>
              Market order, filled at the latest cached price. This is simulated money.
            </DialogDescription>
          </DialogHeader>
          {orderError && (
            <p className="text-xs text-loss" role="alert">
              {orderError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeReview}>
              Cancel
            </Button>
            <Button
              disabled={placeOrder.isPending}
              onClick={() =>
                pendingAction &&
                placeOrder.mutate({
                  symbol: pendingAction.symbol,
                  side: pendingAction.side,
                  usd_amount: pendingAction.usd_amount,
                })
              }
              className={cn(
                pendingAction?.side === 'buy'
                  ? 'bg-profit text-white hover:bg-profit/90'
                  : 'bg-loss text-white hover:bg-loss/90',
              )}
            >
              Confirm {pendingAction?.side}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
