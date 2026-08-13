import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useJsonLd } from './useJsonLd'

describe('useJsonLd', () => {
  it('injects a script[type=application/ld+json] tag with the given id and data', () => {
    renderHook(() => useJsonLd('test-schema', { '@type': 'Thing', name: 'Example' }))
    const script = document.querySelector('script[data-json-ld-id="test-schema"]')
    expect(script).not.toBeNull()
    expect(script?.getAttribute('type')).toBe('application/ld+json')
    expect(JSON.parse(script!.textContent ?? '{}')).toEqual({ '@type': 'Thing', name: 'Example' })
  })

  it('removes the script tag on unmount', () => {
    const { unmount } = renderHook(() => useJsonLd('test-schema-2', { a: 1 }))
    expect(document.querySelector('script[data-json-ld-id="test-schema-2"]')).not.toBeNull()
    unmount()
    expect(document.querySelector('script[data-json-ld-id="test-schema-2"]')).toBeNull()
  })
})
