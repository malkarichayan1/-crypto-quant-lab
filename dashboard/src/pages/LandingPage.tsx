import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Learn to invest without risking a cent
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Trade crypto with $100,000 in virtual cash, real market prices, and
        plain-English AI advice. No real money, ever.
      </p>
      <Button asChild size="lg">
        <Link to="/app">Start simulating — it's free</Link>
      </Button>
    </main>
  )
}
