import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { usePlaceOrder } from '../hooks/usePlaceOrder'
import { formatUnits, formatUsd } from '../lib/format'

type Props = {
  symbol: string
  price: number
  cash: number
  heldUnits: number
}

type Side = 'buy' | 'sell'

const MIN_ORDER_USD = 1
const QUICK_AMOUNTS = [50, 100, 500]

function floorToCents(value: number): number {
  return Math.floor(value * 100) / 100
}

export function OrderTicket({ symbol, price, cash, heldUnits }: Props) {
  const [side, setSide] = useState<Side>('buy')
  const [amount, setAmount] = useState('')
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const heldValue = heldUnits * price
  const parsed = Number(amount)
  const hasAmount = amount.trim() !== ''

  let validationError: string | null = null
  if (hasAmount) {
    if (!Number.isFinite(parsed) || parsed <= 0) {
      validationError = 'Enter a dollar amount.'
    } else if (parsed < MIN_ORDER_USD) {
      validationError = `Minimum order is ${formatUsd(MIN_ORDER_USD)}.`
    } else if (side === 'buy' && parsed > cash) {
      validationError = `Not enough buying power — ${formatUsd(cash)} available.`
    } else if (side === 'sell' && parsed > heldValue) {
      validationError = `You only hold ${formatUsd(heldValue)} of ${symbol}.`
    }
  }
  const inlineError = validationError ?? serverError
  const canReview = hasAmount && !validationError

  const mutation = usePlaceOrder({
    onSuccess: () => {
      setIsReviewOpen(false)
      setAmount('')
      setServerError(null)
    },
    onError: (error) => {
      setIsReviewOpen(false)
      setServerError(error.message)
    },
  })

  const maxAmount = side === 'buy' ? floorToCents(cash) : floorToCents(heldValue)
  const setAmountValue = (value: number) => {
    setServerError(null)
    setAmount(String(value))
  }

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Trade {symbol}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
          {(['buy', 'sell'] as Side[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSide(s)
                setServerError(null)
              }}
              className={cn(
                'rounded-md py-1.5 text-sm font-medium capitalize transition-colors duration-200',
                side === s
                  ? s === 'buy'
                    ? 'bg-profit/15 text-profit'
                    : 'bg-loss/15 text-loss'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="order-amount" className="mb-1 block text-xs text-muted-foreground">
            Amount (USD)
          </label>
          <Input
            id="order-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => {
              setServerError(null)
              setAmount(event.target.value)
            }}
          />
          <div className="mt-2 flex gap-1.5">
            {QUICK_AMOUNTS.map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => setAmountValue(quick)}
                className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                ${quick}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAmountValue(maxAmount)}
              className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              Max
            </button>
          </div>
        </div>

        {canReview && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <p>
              Estimated: <span className="text-foreground">{formatUnits(parsed / price)} {symbol}</span>
            </p>
            <p>
              {side === 'buy'
                ? `Buying power after: ${formatUsd(cash - parsed)}`
                : `You'll receive: ${formatUsd(parsed)}`}
            </p>
          </div>
        )}

        {inlineError && (
          <p className="text-xs text-loss" role="alert">
            {inlineError}
          </p>
        )}

        <Button
          disabled={!canReview || mutation.isPending}
          onClick={() => setIsReviewOpen(true)}
          className={cn(
            'w-full transition-transform duration-200 active:scale-[0.98]',
            side === 'buy'
              ? 'bg-profit text-white hover:bg-profit/90'
              : 'bg-loss text-white hover:bg-loss/90',
          )}
        >
          Review order
        </Button>
      </CardContent>

      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {side} {formatUsd(parsed || 0)} of {symbol}
            </DialogTitle>
            <DialogDescription>
              ≈ {formatUnits((parsed || 0) / price)} {symbol} at {formatUsd(price)} — market
              order, filled at the latest cached price.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReviewOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({ symbol, side, usd_amount: parsed })
              }
              className={cn(
                side === 'buy'
                  ? 'bg-profit text-white hover:bg-profit/90'
                  : 'bg-loss text-white hover:bg-loss/90',
              )}
            >
              Confirm {side}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
