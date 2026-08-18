import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'

// PortfolioSummaryCard fetches on mount; a never-resolving fetch keeps it in
// its loading (skeleton) state so these nav-focused tests don't need to deal
// with async portfolio data.
function renderAt(path: string) {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Sidebar', () => {
  it('renders the beginner nav items with correct targets', () => {
    renderAt('/app')
    const nav = screen.getByRole('navigation', { name: /main navigation/i })
    expect(within(nav).getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/app')
    expect(within(nav).getByRole('link', { name: /markets/i })).toHaveAttribute(
      'href',
      '/app/markets',
    )
    expect(within(nav).getByRole('link', { name: /portfolio/i })).toHaveAttribute(
      'href',
      '/app/portfolio',
    )
    expect(within(nav).getByRole('link', { name: /leaderboard/i })).toHaveAttribute(
      'href',
      '/app/leaderboard',
    )
    expect(within(nav).getByRole('link', { name: /news/i })).toHaveAttribute('href', '/app/news')
    expect(within(nav).getByRole('link', { name: /^learn$/i })).toHaveAttribute(
      'href',
      '/app/learn',
    )
    expect(within(nav).getByRole('link', { name: /settings/i })).toHaveAttribute(
      'href',
      '/app/settings',
    )
  })

  it('groups nav items under Trade and Discover section headers', () => {
    renderAt('/app')
    expect(screen.getByText('Trade')).toBeInTheDocument()
    expect(screen.getByText('Discover')).toBeInTheDocument()
  })

  it('does not render a Strategy Lab section', () => {
    renderAt('/app')
    expect(screen.queryByText('Strategy Lab')).not.toBeInTheDocument()
  })

  it('marks the current section active via aria-current', () => {
    renderAt('/app/markets')
    expect(screen.getByRole('link', { name: /markets/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current')
  })
})
