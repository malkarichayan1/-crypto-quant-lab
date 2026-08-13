import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PageMetaSync } from './PageMetaSync'

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
