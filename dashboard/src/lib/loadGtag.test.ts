import { afterEach, describe, expect, it } from 'vitest'
import { loadGtag } from './loadGtag'

describe('loadGtag', () => {
  afterEach(() => {
    document.getElementById('ga4-gtag-script')?.remove()
    // @ts-expect-error test cleanup of a runtime global
    delete window.dataLayer
    // @ts-expect-error test cleanup of a runtime global
    delete window.gtag
  })

  it('injects the gtag.js script tag pointed at the given measurement ID', () => {
    loadGtag('G-TEST123')
    const script = document.getElementById('ga4-gtag-script') as HTMLScriptElement
    expect(script).not.toBeNull()
    expect(script.src).toContain('G-TEST123')
  })

  it('initializes window.dataLayer and window.gtag', () => {
    loadGtag('G-TEST123')
    expect(window.dataLayer).toBeDefined()
    expect(typeof window.gtag).toBe('function')
  })

  it('does not inject a second script tag if called again', () => {
    loadGtag('G-TEST123')
    loadGtag('G-TEST123')
    expect(document.querySelectorAll('#ga4-gtag-script')).toHaveLength(1)
  })
})
