import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { CookieConsentBanner } from './CookieConsentBanner'
import { setCookieConsent } from '../hooks/useCookieConsent'

function renderBanner() {
  return render(
    <MemoryRouter>
      <CookieConsentBanner />
    </MemoryRouter>,
  )
}

describe('CookieConsentBanner', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('shows Accept/Decline and a link to the Privacy Policy when no choice has been made', () => {
    renderBanner()
    expect(screen.getByRole('button', { name: /^accept$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^decline$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('hides itself once Accept is clicked', async () => {
    const user = userEvent.setup()
    renderBanner()
    await user.click(screen.getByRole('button', { name: /^accept$/i }))
    expect(screen.queryByRole('button', { name: /^accept$/i })).not.toBeInTheDocument()
  })

  it('hides itself once Decline is clicked', async () => {
    const user = userEvent.setup()
    renderBanner()
    await user.click(screen.getByRole('button', { name: /^decline$/i }))
    expect(screen.queryByRole('button', { name: /^decline$/i })).not.toBeInTheDocument()
  })

  it('renders nothing when a choice was already made before mount', () => {
    setCookieConsent('declined')
    renderBanner()
    expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument()
  })
})
