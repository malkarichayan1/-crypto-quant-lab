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

  it('names Google as the analytics recipient and links to its privacy policy', () => {
    renderPage()
    const link = screen.getByRole('link', { name: /google analytics/i })
    expect(link).toHaveAttribute('href', 'https://policies.google.com/privacy')
    expect(screen.getByText(/cross-session identifier/i)).toBeInTheDocument()
  })

  it('clarifies that clearing local storage does not remove GA cookies already set', () => {
    renderPage()
    expect(screen.getByText(/does not remove any cookies ga has already set/i)).toBeInTheDocument()
  })
})
