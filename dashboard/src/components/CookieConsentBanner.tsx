import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { setCookieConsent, useCookieConsent } from '../hooks/useCookieConsent'

export function CookieConsentBanner() {
  const consent = useCookieConsent()
  const location = useLocation()
  if (consent !== null) return null

  // LandingPage (`/`) renders a fixed StickyMobileCta bar on mobile, so the
  // banner needs bottom-[65px] there to stack above it instead of
  // overlapping it (border-t 1px + p-3 24px + h-10 button 40px = 65px).
  // CookieConsentBanner is mounted globally in App.tsx, so every other
  // route has no such bar to clear — use bottom-0 there instead of leaving
  // an unexplained gap above the true viewport bottom.
  const mobileBottomClass = location.pathname === '/' ? 'bottom-[65px]' : 'bottom-0'

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className={`fixed inset-x-0 ${mobileBottomClass} z-50 flex flex-col items-center gap-3 border-t border-border bg-background/95 p-4 backdrop-blur sm:bottom-0 sm:flex-row sm:justify-between`}
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
