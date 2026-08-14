declare global {
  interface Window {
    dataLayer: unknown[][]
    gtag: (...args: unknown[]) => void
  }
}

const SCRIPT_ID = 'ga4-gtag-script'

/**
 * Injects the gtag.js loader script and initializes GA4 with the given
 * measurement ID. No-ops if already loaded — safe to call from an effect
 * that can re-run (e.g. consent flipping from null to "accepted").
 * send_page_view is off; useGoogleAnalytics fires page_view manually on
 * route change instead, since GA4 doesn't auto-track client-side routing.
 */
export function loadGtag(measurementId: string): void {
  if (document.getElementById(SCRIPT_ID)) return

  const script = document.createElement('script')
  script.id = SCRIPT_ID
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer ?? []
  window.gtag = (...args: unknown[]) => {
    window.dataLayer.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('config', measurementId, { send_page_view: false })
}
