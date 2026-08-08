import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OrderTicket } from './OrderTicket'
import * as portfolioApi from '../api/portfolio'
import { toast } from 'sonner'

vi.mock('../api/portfolio')
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

function renderTicket(props: Partial<Parameters<typeof OrderTicket>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <OrderTicket symbol="BTC" price={100} cash={1000} heldUnits={5} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OrderTicket', () => {
  beforeEach(() => {
    vi.mocked(portfolioApi.placeOrder).mockResolvedValue({
      id: '1', symbol: 'BTC', side: 'buy', usd_amount: 250,
      units: 2.5, fill_price: 100, created_at: '2026-07-30T12:00:00Z',
    })
  })

  it('shows estimated units for the entered amount', async () => {
    renderTicket()
    await userEvent.type(screen.getByLabelText(/amount/i), '250')
    expect(screen.getByText(/2\.5000 BTC/)).toBeInTheDocument()
  })

  it('shows an inline error when buying over available cash', async () => {
    renderTicket()
    await userEvent.type(screen.getByLabelText(/amount/i), '5000')
    expect(screen.getByText(/not enough buying power/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /review order/i })).toBeDisabled()
  })

  it('shows an inline error when selling more than held', async () => {
    renderTicket()
    await userEvent.click(screen.getByRole('button', { name: /^sell$/i }))
    await userEvent.type(screen.getByLabelText(/amount/i), '600') // held 5 * $100 = $500
    expect(screen.getByText(/only hold/i)).toBeInTheDocument()
  })

  it('reviews then places the order and toasts with a portfolio link', async () => {
    renderTicket()
    await userEvent.type(screen.getByLabelText(/amount/i), '250')
    await userEvent.click(screen.getByRole('button', { name: /review order/i }))
    expect(await screen.findByText(/buy \$250\.00 of btc/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(portfolioApi.placeOrder).toHaveBeenCalledWith({
      symbol: 'BTC', side: 'buy', usd_amount: 250,
    })
    expect(vi.mocked(toast.success)).toHaveBeenCalled()
  })

  it('renders a server rejection inline', async () => {
    vi.mocked(portfolioApi.placeOrder).mockRejectedValue(
      new Error('Not enough buying power — you have $12.00 available.'),
    )
    renderTicket()
    await userEvent.type(screen.getByLabelText(/amount/i), '250')
    await userEvent.click(screen.getByRole('button', { name: /review order/i }))
    await userEvent.click(await screen.findByRole('button', { name: /confirm/i }))
    expect(await screen.findByText(/\$12\.00 available/)).toBeInTheDocument()
  })

  it('quick chip fills the amount', async () => {
    renderTicket()
    await userEvent.click(screen.getByRole('button', { name: '$100' }))
    expect(screen.getByLabelText(/amount/i)).toHaveValue('100')
  })
})
