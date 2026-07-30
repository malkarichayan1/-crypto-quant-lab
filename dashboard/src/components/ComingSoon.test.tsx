import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { ComingSoon } from './ComingSoon'

describe('ComingSoon', () => {
  it('renders title, description, and optional CTA link', () => {
    render(
      <MemoryRouter>
        <ComingSoon
          icon={Wallet}
          title="Portfolio"
          description="Your positions will live here."
          cta={{ to: '/lab/backtests', label: 'Explore the Strategy Lab' }}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument()
    expect(screen.getByText('Your positions will live here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /explore the strategy lab/i })).toHaveAttribute(
      'href',
      '/lab/backtests',
    )
  })

  it('renders without a CTA', () => {
    render(
      <MemoryRouter>
        <ComingSoon icon={Wallet} title="News" description="Headlines soon." />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
