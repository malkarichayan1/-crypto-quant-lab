import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LandingPage } from './LandingPage'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LandingPage', () => {
  it('renders a headline and a primary CTA into the app, with no interaction required', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    const ctas = screen.getAllByRole('link', { name: /start simulating/i })
    expect(ctas.length).toBeGreaterThan(0)
    for (const cta of ctas) {
      expect(cta).toHaveAttribute('href', '/app')
    }
  })

  it('sets a unique title and description', () => {
    renderPage()
    expect(document.title).toBe('HedgeFund Simulator — Practice investing risk-free')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      'Trade crypto with $100,000 in virtual cash, real market prices, and free AI advice. No real money, ever.',
    )
  })

  it('renders the FAQ section', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /frequently asked questions/i })).toBeInTheDocument()
  })

  it('renders the footer', () => {
    renderPage()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('renders the sticky mobile CTA', () => {
    renderPage()
    expect(screen.getByTestId('sticky-mobile-cta')).toBeInTheDocument()
  })

  it('renders the waitlist form', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument()
  })
})
