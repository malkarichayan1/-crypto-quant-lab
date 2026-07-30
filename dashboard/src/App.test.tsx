import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App routing', () => {
  beforeEach(() => {
    // Lab pages fetch on mount; a never-resolving fetch keeps them in loading state.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  })

  it('renders the Dashboard placeholder at /', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('renders placeholders for the other beginner routes', () => {
    renderAt('/markets')
    expect(screen.getByRole('heading', { name: 'Markets' })).toBeInTheDocument()
  })

  it('redirects legacy /paper to /lab/paper (Paper Sessions nav becomes active)', async () => {
    renderAt('/paper')
    expect(
      await screen.findByRole('link', { name: /paper sessions/i }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('redirects legacy /history to /lab/backtests/history (Backtests nav becomes active)', async () => {
    renderAt('/history')
    expect(
      await screen.findByRole('link', { name: /backtests/i }),
    ).toHaveAttribute('aria-current', 'page')
  })
})
