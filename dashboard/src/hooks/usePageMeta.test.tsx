import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePageMeta } from './usePageMeta'

function getDescription(): string | null {
  return document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null
}

describe('usePageMeta', () => {
  it('sets document.title and the description meta tag', () => {
    renderHook(() => usePageMeta('Test Title', 'Test description.'))
    expect(document.title).toBe('Test Title')
    expect(getDescription()).toBe('Test description.')
  })

  it('updates both when the arguments change', () => {
    const { rerender } = renderHook(({ title, desc }) => usePageMeta(title, desc), {
      initialProps: { title: 'First', desc: 'First desc.' },
    })
    rerender({ title: 'Second', desc: 'Second desc.' })
    expect(document.title).toBe('Second')
    expect(getDescription()).toBe('Second desc.')
  })

  it('restores the previous title and description on unmount', () => {
    document.title = 'Original Title'
    const meta = document.createElement('meta')
    meta.name = 'description'
    meta.content = 'Original description.'
    document.head.appendChild(meta)

    const { unmount } = renderHook(() => usePageMeta('Test Title', 'Test description.'))
    expect(document.title).toBe('Test Title')

    unmount()
    expect(document.title).toBe('Original Title')
    expect(getDescription()).toBe('Original description.')
    meta.remove()
  })
})
