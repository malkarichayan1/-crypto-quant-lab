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
    renderAt('/')
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /markets/i })).toHaveAttribute('href', '/markets')
    expect(screen.getByRole('link', { name: /portfolio/i })).toHaveAttribute('href', '/portfolio')
    expect(screen.getByRole('link', { name: /leaderboard/i })).toHaveAttribute('href', '/leaderboard')
    expect(screen.getByRole('link', { name: /news/i })).toHaveAttribute('href', '/news')
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings')
  })

  it('renders the Strategy Lab section with lab links', () => {
    renderAt('/')
    expect(screen.getByText('Strategy Lab')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /backtests/i })).toHaveAttribute('href', '/lab/backtests')
    expect(screen.getByRole('link', { name: /research/i })).toHaveAttribute('href', '/lab/research')
    expect(screen.getByRole('link', { name: /paper sessions/i })).toHaveAttribute('href', '/lab/paper')
  })

  it('marks the current section active via aria-current', () => {
    renderAt('/markets')
    expect(screen.getByRole('link', { name: /markets/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current')
  })
})
