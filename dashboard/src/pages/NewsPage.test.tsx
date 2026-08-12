import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewsPage } from './NewsPage'

const getNews = vi.fn()
vi.mock('../api/news', () => ({ getNews: () => getNews() }))

const ITEM = {
  title: 'Bitcoin does a thing',
  source: 'CoinDesk',
  url: 'https://example.test/a',
  published_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NewsPage />
    </QueryClientProvider>,
  )
}

describe('NewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getNews.mockResolvedValue({
      items: [ITEM], stale: false, fetched_at: '2026-08-08T12:00:00Z',
    })
  })

  it('renders a heading', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: /news/i })).toBeInTheDocument()
  })

  it('renders each headline as a link to the article', async () => {
    renderPage()

    const link = await screen.findByRole('link', { name: /bitcoin does a thing/i })
    expect(link).toHaveAttribute('href', 'https://example.test/a')
  })

  it('opens articles in a new tab safely', async () => {
    renderPage()

    const link = await screen.findByRole('link', { name: /bitcoin does a thing/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('shows the source', async () => {
    renderPage()

    expect(await screen.findByText('CoinDesk')).toBeInTheDocument()
  })

  it('shows a relative age', async () => {
    renderPage()

    expect(await screen.findByText(/2h ago/i)).toBeInTheDocument()
  })

  it('omits the age for an undated item', async () => {
    getNews.mockResolvedValue({
      items: [{ ...ITEM, published_at: null }], stale: false,
      fetched_at: '2026-08-08T12:00:00Z',
    })

    renderPage()

    await screen.findByText('CoinDesk')
    expect(screen.queryByText(/ago/i)).not.toBeInTheDocument()
  })

  it('shows an empty state when there is no news', async () => {
    getNews.mockResolvedValue({ items: [], stale: false, fetched_at: '2026-08-08T12:00:00Z' })

    renderPage()

    expect(await screen.findByText(/no headlines/i)).toBeInTheDocument()
  })

  it('offers a retry when the fetch fails', async () => {
    getNews.mockRejectedValue(new Error('boom'))

    renderPage()

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('notes when the feed is stale', async () => {
    getNews.mockResolvedValue({
      items: [ITEM], stale: true, fetched_at: '2026-08-08T12:00:00Z',
    })

    renderPage()

    await waitFor(() =>
      expect(screen.getByText(/may be out of date/i)).toBeInTheDocument(),
    )
  })
})
