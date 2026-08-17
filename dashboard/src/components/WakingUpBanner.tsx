import { Loader2 } from 'lucide-react'

/**
 * Shown when the first load is taking long enough to look broken. The free
 * hosting tier idles the API down, so the honest explanation ("starting up",
 * with a time estimate) reads far better than an indefinite skeleton.
 */
export function WakingUpBanner() {
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      Starting up the server — this can take up to a minute on the free plan.
    </div>
  )
}
