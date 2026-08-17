import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSlowLoadNotice } from './useSlowLoadNotice'

describe('useSlowLoadNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is false immediately, so a fast load never flashes the notice', () => {
    const { result } = renderHook(() => useSlowLoadNotice(true, 3000))

    expect(result.current).toBe(false)
  })

  it('stays false while pending but under the delay', () => {
    const { result } = renderHook(() => useSlowLoadNotice(true, 3000))

    act(() => {
      vi.advanceTimersByTime(2999)
    })

    expect(result.current).toBe(false)
  })

  it('becomes true once the request has been pending past the delay', () => {
    const { result } = renderHook(() => useSlowLoadNotice(true, 3000))

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current).toBe(true)
  })

  it('never fires when the request was never pending', () => {
    const { result } = renderHook(() => useSlowLoadNotice(false, 3000))

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(result.current).toBe(false)
  })

  it('resets to false once the request settles', () => {
    const { result, rerender } = renderHook(
      ({ isPending }) => useSlowLoadNotice(isPending, 3000),
      { initialProps: { isPending: true } },
    )

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current).toBe(true)

    rerender({ isPending: false })
    expect(result.current).toBe(false)
  })

  it('clears its timer when the request settles before the delay', () => {
    const { result, rerender } = renderHook(
      ({ isPending }) => useSlowLoadNotice(isPending, 3000),
      { initialProps: { isPending: true } },
    )

    rerender({ isPending: false })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(result.current).toBe(false)
  })
})
