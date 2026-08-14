import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WaitlistForm } from './WaitlistForm'
import * as waitlistApi from '../../api/waitlist'

vi.mock('../../api/waitlist')

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<WaitlistForm />} />
          <Route path="/thank-you" element={<p>thank you</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WaitlistForm', () => {
  beforeEach(() => {
    vi.mocked(waitlistApi.joinWaitlist).mockResolvedValue({ status: 'ok' })
  })

  it('submits the email and navigates to /thank-you on success', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText(/email address/i), 'person@example.com')
    await user.click(screen.getByRole('button', { name: /notify me/i }))
    expect(await screen.findByText('thank you')).toBeInTheDocument()
    expect(waitlistApi.joinWaitlist).toHaveBeenCalledWith('person@example.com', '')
  })

  it('shows an error message and does not navigate on failure', async () => {
    vi.mocked(waitlistApi.joinWaitlist).mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText(/email address/i), 'person@example.com')
    await user.click(screen.getByRole('button', { name: /notify me/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
    expect(screen.queryByText('thank you')).not.toBeInTheDocument()
  })

  it('has a honeypot field hidden from view and screen readers', () => {
    renderForm()
    const honeypot = screen.getByTestId('waitlist-honeypot')
    expect(honeypot).toHaveAttribute('aria-hidden', 'true')
    expect(honeypot).toHaveAttribute('tabindex', '-1')
  })
})
