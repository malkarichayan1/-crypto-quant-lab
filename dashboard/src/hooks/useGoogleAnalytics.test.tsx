import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { useGoogleAnalytics } from './useGoogleAnalytics'
import { setCookieConsent } from './useCookieConsent'

// Captured by NavigationCapture on every render so tests can drive real
// route changes through the router (not a mocked useNavigate), the same way
// a visitor clicking a link would.
let navigate: ReturnType<typeof useNavigate>

function NavigationCapture() {
  navigate = useNavigate()
  return null
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/app']}>
      <NavigationCapture />
      {children}
    </MemoryRouter>
  )
}

/**
 * Every gtag('event', 'page_view', { page_path }) call so far, in order.
 * Reads window.dataLayer directly (what the real loadGtag-installed
 * window.gtag pushes into) rather than spying on window.gtag, since
 * loadGtag (re)assigns window.gtag itself and a pre-installed spy would
 * just get overwritten.
 */
function pageViewCalls(): Array<{ page_path: string }> {
  const entries = (window.dataLayer ?? []) as unknown[][]
  return entries
    .filter((entry) => entry[0] === 'event' && entry[1] === 'page_view')
    .map((entry) => entry[2] as { page_path: string })
}

describe('useGoogleAnalytics', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    document.getElementById('ga4-gtag-script')?.remove()
    window.localStorage.clear()
    // @ts-expect-error test cleanup of a runtime global
    delete window.dataLayer
    // @ts-expect-error test cleanup of a runtime global
    delete window.gtag
  })

  it('does not load GA when consent has not been given', () => {
    renderHook(() => useGoogleAnalytics(), { wrapper })
    expect(document.getElementById('ga4-gtag-script')).toBeNull()
  })

  it('does not fire page_view when consent has not been given', () => {
    renderHook(() => useGoogleAnalytics(), { wrapper })
    expect(pageViewCalls()).toHaveLength(0)
  })

  it('does not load GA when consent is declined', () => {
    setCookieConsent('declined')
    renderHook(() => useGoogleAnalytics(), { wrapper })
    expect(document.getElementById('ga4-gtag-script')).toBeNull()
  })

  it('does not fire page_view when consent is declined', () => {
    setCookieConsent('declined')
    renderHook(() => useGoogleAnalytics(), { wrapper })
    expect(pageViewCalls()).toHaveLength(0)
  })

  it('loads GA once consent is accepted', () => {
    setCookieConsent('accepted')
    renderHook(() => useGoogleAnalytics(), { wrapper })
    expect(document.getElementById('ga4-gtag-script')).not.toBeNull()
  })

  it('does not load GA when no measurement ID is configured', () => {
    vi.unstubAllEnvs()
    setCookieConsent('accepted')
    renderHook(() => useGoogleAnalytics(), { wrapper })
    expect(document.getElementById('ga4-gtag-script')).toBeNull()
  })

  it('fires a page_view event for the current route once consent is accepted', () => {
    setCookieConsent('accepted')
    renderHook(() => useGoogleAnalytics(), { wrapper })
    expect(pageViewCalls()).toEqual([{ page_path: '/app' }])
  })

  it('fires another page_view event when the route changes', () => {
    setCookieConsent('accepted')
    renderHook(() => useGoogleAnalytics(), { wrapper })

    act(() => navigate('/app/portfolio'))

    expect(pageViewCalls()).toEqual([{ page_path: '/app' }, { page_path: '/app/portfolio' }])
  })
})
