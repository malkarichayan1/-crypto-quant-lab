import { Clock } from 'lucide-react'

export function StalePricesBanner() {
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-lg border border-watch/30 bg-watch/10 px-3 py-2 text-sm text-watch"
    >
      <Clock className="size-4 shrink-0" aria-hidden="true" />
      Prices delayed — showing the last data we received.
    </div>
  )
}
