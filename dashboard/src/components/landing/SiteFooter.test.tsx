import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SiteFooter } from './SiteFooter'

function renderFooter() {
  return render(
    <MemoryRouter>
      <SiteFooter />
    </MemoryRouter>,
  )
}

describe('SiteFooter', () => {
  it('links to Markets, the FAQ anchor, Privacy Policy, and the app', () => {
    renderFooter()
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: /^markets$/i })).toHaveAttribute(
      'href',
      '/app/markets',
    )
    expect(within(footer).getByRole('link', { name: /^faq$/i })).toHaveAttribute(
      'href',
      '#faq-heading',
    )
    expect(within(footer).getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
    expect(within(footer).getByRole('link', { name: /start simulating/i })).toHaveAttribute(
      'href',
      '/app',
    )
  })

  it('shows a response-time note with a mailto link', () => {
    renderFooter()
    const link = screen.getByRole('link', { name: /email us/i })
    expect(link).toHaveAttribute('href', 'mailto:malkarichayan1@gmail.com')
    expect(screen.getByText(/within 24 hours/i)).toBeInTheDocument()
  })
})
