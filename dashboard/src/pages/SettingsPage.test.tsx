import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'

const resetPortfolio = vi.fn()
vi.mock('../api/portfolio', () => ({ resetPortfolio: (b: unknown) => resetPortfolio(b) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>,
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it('renders a heading', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument()
  })

  it('shows the advisor toggle switched on by default', () => {
    renderPage()

    expect(screen.getByRole('switch', { name: /ai advisor/i })).toBeChecked()
  })

  it('turns the advisor off when toggled', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('switch', { name: /ai advisor/i }))

    expect(screen.getByRole('switch', { name: /ai advisor/i })).not.toBeChecked()
  })

  it('persists the preference to localStorage', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('switch', { name: /ai advisor/i }))

    expect(window.localStorage.getItem('hedgefund.advisorEnabled')).toBe('false')
  })

  it('reads a previously saved preference on mount', () => {
    window.localStorage.setItem('hedgefund.advisorEnabled', 'false')

    renderPage()

    expect(screen.getByRole('switch', { name: /ai advisor/i })).not.toBeChecked()
  })

  it('shows a starting cash input defaulting to 100,000', () => {
    renderPage()

    expect(screen.getByLabelText(/starting cash/i)).toHaveValue(100000)
  })

  it('does not reset until the dialog is confirmed', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /reset portfolio/i }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(resetPortfolio).not.toHaveBeenCalled()
  })

  it('resets with the entered starting cash once confirmed', async () => {
    resetPortfolio.mockResolvedValue({ id: 'x', starting_cash: 5000, created_at: 'now' })
    renderPage()

    const input = screen.getByLabelText(/starting cash/i)
    await userEvent.clear(input)
    await userEvent.type(input, '5000')
    await userEvent.click(screen.getByRole('button', { name: /reset portfolio/i }))
    await userEvent.click(await screen.findByRole('button', { name: /yes, reset/i }))

    await waitFor(() => expect(resetPortfolio).toHaveBeenCalledWith({ starting_cash: 5000 }))
  })

  it('closes the dialog without resetting when cancelled', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /reset portfolio/i }))
    await userEvent.click(await screen.findByRole('button', { name: /cancel/i }))

    expect(resetPortfolio).not.toHaveBeenCalled()
  })

  it('warns that resetting is permanent', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /reset portfolio/i }))

    expect(await screen.findByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('rejects a non-positive starting cash', async () => {
    renderPage()

    const input = screen.getByLabelText(/starting cash/i)
    await userEvent.clear(input)
    await userEvent.type(input, '0')

    expect(screen.getByRole('button', { name: /reset portfolio/i })).toBeDisabled()
  })
})
