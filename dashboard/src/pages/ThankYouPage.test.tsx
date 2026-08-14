import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThankYouPage } from './ThankYouPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <ThankYouPage />
    </MemoryRouter>,
  )
}

describe('ThankYouPage', () => {
  it('renders a confirmation heading, a CTA into the app, and a unique title', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start simulating/i })).toHaveAttribute(
      'href',
      '/app',
    )
    expect(document.title).toBe('Thanks! — HedgeFund Simulator')
  })
})
