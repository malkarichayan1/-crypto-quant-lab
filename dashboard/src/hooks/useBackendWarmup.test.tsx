import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { warmBackend } from '../lib/warmBackend'
import { useBackendWarmup } from './useBackendWarmup'

vi.mock('../lib/warmBackend', () => ({ warmBackend: vi.fn() }))

describe('useBackendWarmup', () => {
  beforeEach(() => {
    vi.mocked(warmBackend).mockClear()
  })

  it('warms the backend on mount', () => {
    renderHook(() => useBackendWarmup())

    expect(warmBackend).toHaveBeenCalledTimes(1)
  })

  it('does not re-warm on re-render', () => {
    const { rerender } = renderHook(() => useBackendWarmup())
    rerender()
    rerender()

    expect(warmBackend).toHaveBeenCalledTimes(1)
  })
})
