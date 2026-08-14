import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { loadGtag } from '../lib/loadGtag'
import { useCookieConsent } from './useCookieConsent'

/**
 * Loads GA4 only once the visitor has accepted the cookie-consent banner,
 * and only when a measurement ID is actually configured. Fires a manual
 * page_view on every route change (GA4 doesn't auto-track client-side
 * router navigation). Reads import.meta.env fresh on every render, not at
 * module scope, so it stays testable via vi.stubEnv.
 */
export function useGoogleAnalytics(): void {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
  const consent = useCookieConsent()
  const location = useLocation()

  useEffect(() => {
    if (!measurementId || consent !== 'accepted') return
    loadGtag(measurementId)
  }, [measurementId, consent])

  useEffect(() => {
    if (!measurementId || consent !== 'accepted') return
    window.gtag?.('event', 'page_view', {
      page_path: location.pathname + location.search,
    })
  }, [measurementId, consent, location.pathname, location.search])
}
