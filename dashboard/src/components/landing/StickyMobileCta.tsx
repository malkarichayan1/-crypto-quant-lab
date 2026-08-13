import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function StickyMobileCta() {
  return (
    <div
      data-testid="sticky-mobile-cta"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur sm:hidden"
    >
      <Button asChild size="lg" className="w-full">
        <Link to="/app">Start simulating — it's free</Link>
      </Button>
    </div>
  )
}
