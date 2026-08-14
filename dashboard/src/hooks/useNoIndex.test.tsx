import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useNoIndex } from './useNoIndex'

function getRobotsContent(): string | null {
  return document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null
}

describe('useNoIndex', () => {
  it('sets a noindex robots meta tag', () => {
    renderHook(() => useNoIndex())
    expect(getRobotsContent()).toBe('noindex')
  })

  it('restores the previous robots meta content on unmount', () => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'index, follow'
    document.head.appendChild(meta)

    const { unmount } = renderHook(() => useNoIndex())
    expect(getRobotsContent()).toBe('noindex')

    unmount()
    expect(getRobotsContent()).toBe('index, follow')
    meta.remove()
  })

  it('removes the tag on unmount when it created it', () => {
    const { unmount } = renderHook(() => useNoIndex())
    expect(getRobotsContent()).toBe('noindex')

    unmount()
    expect(document.querySelector('meta[name="robots"]')).not.toBeInTheDocument()
  })
})
