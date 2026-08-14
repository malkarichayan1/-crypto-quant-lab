import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useGoogleAnalytics } from './useGoogleAnalytics'
import { setCookieConsent } from './useCookieConsent'

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/app']}>{children}</MemoryRouter>
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

  it('does not load GA when consent is declined', () => {
    setCookieConsent('declined')
    renderHook(() => useGoogleAnalytics(), { wrapper })
    expect(document.getElementById('ga4-gtag-script')).toBeNull()
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
})
