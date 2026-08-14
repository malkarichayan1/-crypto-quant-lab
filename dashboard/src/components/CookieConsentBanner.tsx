import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { setCookieConsent, useCookieConsent } from '../hooks/useCookieConsent'

export function CookieConsentBanner() {
  const consent = useCookieConsent()
  if (consent !== null) return null

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      // bottom-[65px] stacks the banner above LandingPage's StickyMobileCta
      // (border-t 1px + p-3 24px + h-10 button 40px = 65px) instead of
      // overlapping it — both are `fixed inset-x-0 bottom-0` on mobile.
      // sm:bottom-0 resets once StickyMobileCta hides itself (`sm:hidden`).
      className="fixed inset-x-0 bottom-[65px] z-50 flex flex-col items-center gap-3 border-t border-border bg-background/95 p-4 backdrop-blur sm:bottom-0 sm:flex-row sm:justify-between"
    >
      <p className="text-sm text-muted-foreground">
        We use analytics cookies to understand how the app is used. See our{' '}
        <Link to="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={() => setCookieConsent('declined')}>
          Decline
        </Button>
        <Button size="sm" onClick={() => setCookieConsent('accepted')}>
          Accept
        </Button>
      </div>
    </div>
  )
}
