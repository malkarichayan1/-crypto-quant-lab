import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Breadcrumbs, type Crumb } from './Breadcrumbs'

function renderCrumbs(items: Crumb[]) {
  return render(
    <MemoryRouter>
      <Breadcrumbs items={items} />
    </MemoryRouter>,
  )
}

describe('Breadcrumbs', () => {
  const items: Crumb[] = [
    { label: 'Dashboard', to: '/app' },
    { label: 'Markets', to: '/app/markets' },
    { label: 'BTC' },
  ]

  it('renders every label', () => {
    renderCrumbs(items)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Markets')).toBeInTheDocument()
    expect(screen.getByText('BTC')).toBeInTheDocument()
  })

  it('renders a link for every item that has a `to`, except never for the last item', () => {
    renderCrumbs(items)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/app')
    expect(screen.getByRole('link', { name: 'Markets' })).toHaveAttribute(
      'href',
      '/app/markets',
    )
    expect(screen.queryByRole('link', { name: 'BTC' })).not.toBeInTheDocument()
  })

  it('marks the last item as the current page and does not link it even if it has a `to`', () => {
    renderCrumbs([{ label: 'Dashboard', to: '/app' }, { label: 'BTC', to: '/app/coins/BTC' }])
    const last = screen.getByText('BTC')
    expect(last).toHaveAttribute('aria-current', 'page')
    expect(last.tagName).toBe('SPAN')
  })

  it('renders a non-clickable label for a middle item with no `to`', () => {
    renderCrumbs([
      { label: 'Dashboard', to: '/app' },
      { label: 'Strategy Lab' },
      { label: 'Backtests', to: '/app/lab/backtests/history' },
      { label: 'momentum_2024' },
    ])
    expect(screen.queryByRole('link', { name: 'Strategy Lab' })).not.toBeInTheDocument()
    expect(screen.getByText('Strategy Lab')).toBeInTheDocument()
  })
})
