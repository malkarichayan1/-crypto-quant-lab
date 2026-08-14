import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../hooks/usePageMeta'

export function ThankYouPage() {
  usePageMeta(
    'Thanks! — HedgeFund Simulator',
    "You're on the list. Head into the app to start simulating trades right now.",
  )

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold">You're on the list</h1>
      <p className="text-muted-foreground">
        Thanks for signing up. In the meantime, there's nothing stopping you
        from starting right now — no account needed.
      </p>
      <Button asChild size="lg">
        <Link to="/app">Start simulating — it's free</Link>
      </Button>
    </main>
  )
}
