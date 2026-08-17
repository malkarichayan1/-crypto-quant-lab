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
})
