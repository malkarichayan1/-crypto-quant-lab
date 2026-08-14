import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPolicyPage } from './PrivacyPolicyPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <PrivacyPolicyPage />
    </MemoryRouter>,
  )
}

describe('PrivacyPolicyPage', () => {
  it('renders a heading, the not-legal-advice disclaimer, and a unique title', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /privacy policy/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/not a lawyer/i)).toBeInTheDocument()
    expect(document.title).toBe('Privacy Policy — HedgeFund Simulator')
  })

  it('links back to the home page', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
  })

  it('mentions the actual data practices: no accounts, local storage, analytics consent, waitlist emails', () => {
    renderPage()
    expect(screen.getByText(/no sign-up/i)).toBeInTheDocument()
    expect(screen.getByText(/local storage/i)).toBeInTheDocument()
    expect(screen.getByText(/google analytics/i)).toBeInTheDocument()
    expect(screen.getByText(/get notified about new features/i)).toBeInTheDocument()
  })
})
