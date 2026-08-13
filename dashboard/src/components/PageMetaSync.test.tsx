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

  // These three routes each have a same-position static sibling and a
  // dynamic :id/:section sibling in APP_PAGE_META. A plain array .find()
  // would silently pick whichever entry happens to come first in the
  // table; matchRoutes must rank the static match ahead of the dynamic
  // one regardless of table order.
  it('resolves the static Backtest History title, not the dynamic Backtest Result (:id) title', () => {
    renderAt('/app/lab/backtests/history')
    expect(document.title).toBe('Backtest History — Strategy Lab')
  })

  it('resolves the static Research History title, not the dynamic Research Run (:id) title', () => {
    renderAt('/app/lab/research/history')
    expect(document.title).toBe('Research History — Strategy Lab')
  })

  it('resolves the static Paper Session History title, not the dynamic Paper Session (:id) title', () => {
    renderAt('/app/lab/paper/history')
    expect(document.title).toBe('Paper Session History — Strategy Lab')
  })
})
