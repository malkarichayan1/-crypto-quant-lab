import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../hooks/usePageMeta'
import { FaqSection } from '../components/landing/FaqSection'
import { SiteFooter } from '../components/landing/SiteFooter'
import { StickyMobileCta } from '../components/landing/StickyMobileCta'
import { WaitlistForm } from '../components/landing/WaitlistForm'

export function LandingPage() {
  usePageMeta(
    'HedgeFund Simulator — Practice investing risk-free',
    'Trade crypto with $100,000 in virtual cash, real market prices, and free AI advice. No real money, ever.',
  )

  return (
    // pb-20 keeps footer content clear of the fixed sticky CTA bar on mobile.
    <div className="pb-20 sm:pb-0">
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
      <FaqSection />
      <WaitlistForm />
      <SiteFooter />
      <StickyMobileCta />
    </div>
  )
}
