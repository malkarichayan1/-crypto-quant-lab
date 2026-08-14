import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { setCookieConsent, useCookieConsent } from './useCookieConsent'

describe('useCookieConsent', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('returns null when no choice has been made', () => {
    const { result } = renderHook(() => useCookieConsent())
    expect(result.current).toBeNull()
  })

  it('reflects the stored choice after setCookieConsent("accepted")', () => {
    const { result } = renderHook(() => useCookieConsent())
    act(() => setCookieConsent('accepted'))
    expect(result.current).toBe('accepted')
  })

  it('reflects the stored choice after setCookieConsent("declined")', () => {
    const { result } = renderHook(() => useCookieConsent())
    act(() => setCookieConsent('declined'))
    expect(result.current).toBe('declined')
  })
})
