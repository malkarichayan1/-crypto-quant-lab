import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { Switch } from '@/components/ui/switch'
import { resetPortfolio } from '../api/portfolio'
import { setAdvisorEnabled, useAdvisorEnabled } from '../hooks/useAdvisorEnabled'
import { formatUsd } from '../lib/format'

const DEFAULT_STARTING_CASH = 100_000

export function SettingsPage() {
  const advisorEnabled = useAdvisorEnabled()
  const [startingCash, setStartingCash] = useState(String(DEFAULT_STARTING_CASH))
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const queryClient = useQueryClient()

  const parsed = Number(startingCash)
  const isValid = Number.isFinite(parsed) && parsed > 0

  const reset = useMutation({
    mutationFn: (body: { starting_cash: number }) => resetPortfolio(body),
    onSuccess: () => {
      setIsConfirmOpen(false)
      // Everything downstream of the portfolio is now wrong: holdings, orders,
      // equity history, the leaderboard's "You" row, and any cached advice.
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      queryClient.invalidateQueries({ queryKey: ['advice'] })
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
      toast.success(`Portfolio reset to ${formatUsd(parsed)} ✓`)
    },
    // Destructive, irreversible action: on failure, keep the dialog open and
    // show why — never fail silently, never auto-close so the user can see
    // the error and choose to retry or cancel explicitly.
    onError: (error: Error) => {
      toast.error(error.message || 'Reset failed. Please try again.')
    },
  })

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Advisor</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex items-center justify-between gap-6">
              <span>
                <span className="block text-sm font-medium">AI Advisor</span>
                <span className="block text-xs text-muted-foreground">
                  Show suggestion cards on the Dashboard and coin pages. Suggestions are
                  only generated when you ask for them.
                </span>
              </span>
              <Switch
                aria-label="AI Advisor"
                checked={advisorEnabled}
                onCheckedChange={setAdvisorEnabled}
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Portfolio</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <label htmlFor="starting-cash" className="mb-1 block text-sm font-medium">
                Starting cash
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                The balance your next reset will begin from.
              </p>
              <Input
                id="starting-cash"
                type="number"
                min={1}
                value={startingCash}
                onChange={(event) => setStartingCash(event.target.value)}
                className="max-w-48"
              />
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs text-muted-foreground">
                Resetting starts a fresh portfolio. Your current holdings and order
                history are left behind.
              </p>
              <Button
                variant="outline"
                disabled={!isValid || reset.isPending}
                onClick={() => setIsConfirmOpen(true)}
                className="border-loss/40 text-loss hover:bg-loss/10"
              >
                Reset portfolio
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          // Escape, overlay-click, and the built-in X button all dismiss via
          // onOpenChange too — not just the Cancel button. Block all of them
          // while a reset is in flight, or a delayed success would silently
          // invalidate caches and toast after the user thought they'd backed out.
          if (!open && reset.isPending) return
          setIsConfirmOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your portfolio?</DialogTitle>
            <DialogDescription>
              You'll start over with {formatUsd(isValid ? parsed : 0)}. Your current
              holdings and order history will no longer be shown. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {reset.isError && (
            <p className="text-xs text-loss" role="alert">
              {reset.error.message || 'Reset failed. Please try again.'}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={reset.isPending}
              onClick={() => setIsConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={reset.isPending}
              onClick={() => reset.mutate({ starting_cash: parsed })}
              className="bg-loss text-white hover:bg-loss/90"
            >
              Yes, reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
