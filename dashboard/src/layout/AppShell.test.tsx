import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<p>routed content</p>} />
          <Route path="/lab/:section" element={<p>lab content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  it('renders top bar, sidebar, and routed content', () => {
    renderAt('/')
    expect(screen.getByText('HedgeFund Sim')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument()
    expect(screen.getByText('routed content')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('does not apply legacy-scope on non-lab routes', () => {
    renderAt('/')
    const content = screen.getByText('routed content')
    expect(content.closest('.legacy-scope')).not.toBeInTheDocument()
  })

  it('applies legacy-scope on /lab/* routes', () => {
    renderAt('/lab/backtests')
    const content = screen.getByText('lab content')
    expect(content.closest('.legacy-scope')).toBeInTheDocument()
  })
})
