import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  })

  it('renders top bar, sidebar, and routed content', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/app" element={<p>routed content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText('HedgeFund Sim')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument()
    expect(screen.getByText('routed content')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('does not apply legacy-scope on non-lab routes', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/app" element={<p>routed content</p>} />
              <Route path="/app/lab/:section" element={<p>lab content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const content = screen.getByText('routed content')
    expect(content.closest('.legacy-scope')).not.toBeInTheDocument()
  })

  it('applies legacy-scope on /app/lab/* routes', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app/lab/backtests']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/app" element={<p>routed content</p>} />
              <Route path="/app/lab/:section" element={<p>lab content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const content = screen.getByText('lab content')
    expect(content.closest('.legacy-scope')).toBeInTheDocument()
  })
})
