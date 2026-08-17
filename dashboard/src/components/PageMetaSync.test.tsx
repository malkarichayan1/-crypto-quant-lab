import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PageMetaSync, resolvePageMeta } from './PageMetaSync'
import type { PageMetaEntry } from '../routes/pageMeta'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<PageMetaSync />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PageMetaSync', () => {
  it('sets the Dashboard title at /app', () => {
    renderAt('/app')
    expect(document.title).toBe('Dashboard — HedgeFund Simulator')
  })

  it('sets the Trade title for a dynamic /app/coins/:symbol path', () => {
    renderAt('/app/coins/BTC')
    expect(document.title).toBe('Trade — HedgeFund Simulator')
  })

  it('falls back to the generic title for an unmapped path', () => {
    renderAt('/app/something-unmapped')
    expect(document.title).toBe('HedgeFund Simulator')
  })
})

describe('resolvePageMeta', () => {
  it('ranks a static route ahead of a same-shape dynamic sibling regardless of array order', () => {
    const dynamicEntry: PageMetaEntry = {
      pattern: '/test/:id',
      title: 'Dynamic Title',
      description: 'Dynamic description.',
    }
    const staticEntry: PageMetaEntry = {
      pattern: '/test/history',
      title: 'Static Title',
      description: 'Static description.',
    }
    const fallback: PageMetaEntry = {
      pattern: '*',
      title: 'Fallback Title',
      description: 'Fallback description.',
    }

    // Dynamic entry listed FIRST — a plain array .find() would return it
    // for '/test/history', since /test/:id matches that path too. This
    // mirrors pageMeta.ts's history/:id siblings, but here the order is
    // deliberately rigged against the old buggy behavior so this test
    // fails if PageMetaSync ever regresses to a linear .find().
    const entries = [dynamicEntry, staticEntry]

    const resolved = resolvePageMeta(entries, fallback, '/test/history')

    expect(resolved.title).toBe('Static Title')
  })
})
