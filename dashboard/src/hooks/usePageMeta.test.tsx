import { afterEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePageMeta } from './usePageMeta'

function getDescription(): string | null {
  return document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null
}

function getCanonicalHref(): string | null {
  return document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
}

describe('usePageMeta', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('sets document.title, the description meta tag, and a self-referencing canonical link', () => {
    window.history.pushState({}, '', '/test-path')
    renderHook(() => usePageMeta('Test Title', 'Test description.'))
    expect(document.title).toBe('Test Title')
    expect(getDescription()).toBe('Test description.')
    expect(getCanonicalHref()).toBe(`${window.location.origin}/test-path`)
  })

  it('updates title, description, and canonical when the route/args change', () => {
    window.history.pushState({}, '', '/first')
    const { rerender } = renderHook(({ title, desc }) => usePageMeta(title, desc), {
      initialProps: { title: 'First', desc: 'First desc.' },
    })
    expect(getCanonicalHref()).toBe(`${window.location.origin}/first`)

    rerender({ title: 'Second', desc: 'Second desc.' })
    expect(document.title).toBe('Second')
    expect(getDescription()).toBe('Second desc.')

    // A route change alone (title/description unchanged) must also update
    // the canonical link — this is the scenario PageMetaSync hits when two
    // dynamic sibling routes resolve to the same title/description.
    window.history.pushState({}, '', '/second')
    rerender({ title: 'Second', desc: 'Second desc.' })
    expect(getCanonicalHref()).toBe(`${window.location.origin}/second`)
  })

  it('restores the previous title, description, and canonical href on unmount', () => {
    document.title = 'Original Title'
    const meta = document.createElement('meta')
    meta.name = 'description'
    meta.content = 'Original description.'
    document.head.appendChild(meta)
    const canonical = document.createElement('link')
    canonical.rel = 'canonical'
    canonical.href = 'https://example.com/original'
    document.head.appendChild(canonical)

    const { unmount } = renderHook(() => usePageMeta('Test Title', 'Test description.'))
    expect(document.title).toBe('Test Title')
    expect(getCanonicalHref()).not.toBe('https://example.com/original')

    unmount()
    expect(document.title).toBe('Original Title')
    expect(getDescription()).toBe('Original description.')
    expect(getCanonicalHref()).toBe('https://example.com/original')
    meta.remove()
    canonical.remove()
  })
})
