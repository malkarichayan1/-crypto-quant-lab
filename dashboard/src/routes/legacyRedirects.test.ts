import { describe, expect, it } from 'vitest'
import { PARAM_REDIRECTS, STATIC_REDIRECTS } from './legacyRedirects'

describe('legacyRedirects', () => {
  it('every static redirect target is /app or under it', () => {
    for (const to of Object.values(STATIC_REDIRECTS)) {
      expect(to === '/app' || to.startsWith('/app/')).toBe(true)
    }
  })

  it('every param redirect target is /app or under it', () => {
    for (const { to } of PARAM_REDIRECTS) {
      expect(to === '/app' || to.startsWith('/app/')).toBe(true)
    }
  })

  it('has no source path listed twice across the two tables', () => {
    const staticFroms = Object.keys(STATIC_REDIRECTS)
    const paramFroms = PARAM_REDIRECTS.map((r) => r.from)
    const all = [...staticFroms, ...paramFroms]
    expect(new Set(all).size).toBe(all.length)
  })
})
