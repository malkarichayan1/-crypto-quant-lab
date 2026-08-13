import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from './Sidebar'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  it('renders the beginner nav items with correct targets', () => {
    renderAt('/app')
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/app')
    expect(screen.getByRole('link', { name: /markets/i })).toHaveAttribute('href', '/app/markets')
    expect(screen.getByRole('link', { name: /portfolio/i })).toHaveAttribute(
      'href',
      '/app/portfolio',
    )
    expect(screen.getByRole('link', { name: /leaderboard/i })).toHaveAttribute(
      'href',
      '/app/leaderboard',
    )
    expect(screen.getByRole('link', { name: /news/i })).toHaveAttribute('href', '/app/news')
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute(
      'href',
      '/app/settings',
    )
  })

  it('renders the Strategy Lab section with lab links', () => {
    renderAt('/app')
    expect(screen.getByText('Strategy Lab')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /backtests/i })).toHaveAttribute(
      'href',
      '/app/lab/backtests',
    )
    expect(screen.getByRole('link', { name: /research/i })).toHaveAttribute(
      'href',
      '/app/lab/research',
    )
    expect(screen.getByRole('link', { name: /paper sessions/i })).toHaveAttribute(
      'href',
      '/app/lab/paper',
    )
  })

  it('marks the current section active via aria-current', () => {
    renderAt('/app/markets')
    expect(screen.getByRole('link', { name: /markets/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current')
  })
})
