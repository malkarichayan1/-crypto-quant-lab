import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdvisorCard } from './AdvisorCard'

const getAdvice = vi.fn()
const generateAdvice = vi.fn()
vi.mock('../api/advice', () => ({
  getAdvice: (s?: string) => getAdvice(s),
  generateAdvice: (s?: string) => generateAdvice(s),
}))

const mutate = vi.fn()
vi.mock('../hooks/usePlaceOrder', () => ({
  usePlaceOrder: () => ({ mutate, isPending: false }),
}))

const SUGGESTION = { text: 'Consider buying BTC', why: 'Its RSI is 22.', action: null }
const WITH_ACTION = {
  text: 'Buy $100 of BTC',
  why: 'Oversold.',
  action: { side: 'buy' as const, symbol: 'BTC', usd_amount: 100 },
}

function payload(suggestions: unknown[], source = 'llm') {
  return {
    enabled: true,
    advice: {
      suggestions,
      disclaimer: 'Simulated learning advice — not financial advice.',
      source,
    },
  }
}

function renderCard(props: { symbol?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AdvisorCard {...props} />
    </QueryClientProvider>,
  )
}

describe('AdvisorCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    getAdvice.mockResolvedValue({ enabled: true, advice: null })
    generateAdvice.mockResolvedValue(payload([SUGGESTION]))
  })

  it('shows a Get advice button when nothing is cached', async () => {
    renderCard()

    expect(await screen.findByRole('button', { name: /get advice/i })).toBeInTheDocument()
  })

  it('does not generate advice on mount', async () => {
    renderCard()

    await screen.findByRole('button', { name: /get advice/i })
    expect(generateAdvice).not.toHaveBeenCalled()
  })

  it('renders cached advice without needing a click', async () => {
    getAdvice.mockResolvedValue(payload([SUGGESTION]))

    renderCard()

    expect(await screen.findByText('Consider buying BTC')).toBeInTheDocument()
  })

  it('generates advice when the button is clicked', async () => {
    renderCard()

    await userEvent.click(await screen.findByRole('button', { name: /get advice/i }))

    await waitFor(() => expect(generateAdvice).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Consider buying BTC')).toBeInTheDocument()
  })

  it('passes the symbol through when scoped to a coin', async () => {
    renderCard({ symbol: 'ETH' })

    await userEvent.click(await screen.findByRole('button', { name: /get advice/i }))

    await waitFor(() => expect(generateAdvice).toHaveBeenCalledWith('ETH'))
  })

  it('always renders the disclaimer alongside advice', async () => {
    getAdvice.mockResolvedValue(payload([SUGGESTION]))

    renderCard()

    expect(await screen.findByText(/not financial advice/i)).toBeInTheDocument()
  })

  it('reveals the reasoning when Why is expanded', async () => {
    getAdvice.mockResolvedValue(payload([SUGGESTION]))
    renderCard()

    await userEvent.click(await screen.findByRole('button', { name: /why/i }))

    expect(screen.getByText('Its RSI is 22.')).toBeInTheDocument()
  })

  it('notes when the text came from the template fallback', async () => {
    getAdvice.mockResolvedValue(payload([SUGGESTION], 'template'))

    renderCard()

    expect(await screen.findByText(/generated without the ai/i)).toBeInTheDocument()
  })

  it('shows no trade button for a suggestion with no action', async () => {
    getAdvice.mockResolvedValue(payload([SUGGESTION]))

    renderCard()

    await screen.findByText('Consider buying BTC')
    expect(screen.queryByRole('button', { name: /^buy \$/i })).not.toBeInTheDocument()
  })

  it('shows a one-tap trade button when the suggestion carries an action', async () => {
    getAdvice.mockResolvedValue(payload([WITH_ACTION]))

    renderCard()

    expect(
      await screen.findByRole('button', { name: /buy \$100\.00 of BTC/i }),
    ).toBeInTheDocument()
  })

  it('opens a review dialog instead of filling immediately', async () => {
    getAdvice.mockResolvedValue(payload([WITH_ACTION]))
    renderCard()

    await userEvent.click(await screen.findByRole('button', { name: /buy \$100\.00 of BTC/i }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('places the order only after the dialog is confirmed', async () => {
    getAdvice.mockResolvedValue(payload([WITH_ACTION]))
    renderCard()

    await userEvent.click(await screen.findByRole('button', { name: /buy \$100\.00 of BTC/i }))
    await userEvent.click(await screen.findByRole('button', { name: /confirm buy/i }))

    expect(mutate).toHaveBeenCalledWith({ symbol: 'BTC', side: 'buy', usd_amount: 100 })
  })

  it('renders nothing when the advisor is disabled server-side', async () => {
    getAdvice.mockResolvedValue({ enabled: false, advice: null })

    const { container } = renderCard()

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('offers a retry when generation fails', async () => {
    generateAdvice.mockRejectedValue(new Error('boom'))
    renderCard()

    await userEvent.click(await screen.findByRole('button', { name: /get advice/i }))

    expect(await screen.findByText(/couldn't generate advice/i)).toBeInTheDocument()
  })
})
