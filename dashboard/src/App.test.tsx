import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { PARAM_REDIRECTS, STATIC_REDIRECTS } from './routes/legacyRedirects'

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Maps an /app destination to the Sidebar link that should be aria-current
// once a redirect lands there — every STATIC_REDIRECTS/PARAM_REDIRECTS
// target (except /app/coins/:symbol, tested separately) falls under one of
// these eight prefixes.
const NAV_LABEL_FOR_APP_PREFIX: Array<{ prefix: string; label: RegExp }> = [
  { prefix: '/app/lab/backtests', label: /backtests/i },
  { prefix: '/app/lab/research', label: /research/i },
  { prefix: '/app/lab/paper', label: /paper sessions/i },
  { prefix: '/app/markets', label: /markets/i },
  { prefix: '/app/portfolio', label: /portfolio/i },
  { prefix: '/app/leaderboard', label: /leaderboard/i },
  { prefix: '/app/news', label: /news/i },
  { prefix: '/app/settings', label: /settings/i },
]

function navLabelFor(appPath: string): RegExp {
  const match = NAV_LABEL_FOR_APP_PREFIX.find(({ prefix }) => appPath.startsWith(prefix))
  if (!match) throw new Error(`No nav section mapped for ${appPath}`)
  return match.label
}

describe('App routing', () => {
  beforeEach(() => {
    // Lab pages fetch on mount; a never-resolving fetch keeps them in loading state.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    // AgentResultPage and PaperLivePage open a live EventSource on mount, which
    // jsdom doesn't implement. Their own test files mock the whole api module to
    // avoid this; here we exercise the real component tree via redirects, so a
    // minimal stub keeps mount from throwing (no error boundary exists in the
    // app, so an uncaught error here would unmount the Sidebar too and fail the
    // aria-current assertion below for an unrelated reason).
    vi.stubGlobal(
      'EventSource',
      vi.fn().mockImplementation(() => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        close: vi.fn(),
      })),
    )
  })

  it('renders the landing page at /', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start simulating/i })).toHaveAttribute(
      'href',
      '/app',
    )
  })

  it('renders the Dashboard at /app', () => {
    renderAt('/app')
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('renders the Markets page at /app/markets', () => {
    renderAt('/app/markets')
    expect(screen.getByRole('heading', { name: 'Markets' })).toBeInTheDocument()
  })

  it('renders the trade view at /app/coins/:symbol', () => {
    renderAt('/app/coins/BTC')
    expect(screen.getByText('BTC', { selector: 'p' })).toBeInTheDocument()
  })

  it('renders the Portfolio page at /app/portfolio', () => {
    renderAt('/app/portfolio')
    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument()
  })

  it('renders the 404 page for an unknown path with a noindex meta tag', () => {
    renderAt('/this-page-does-not-exist')
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  describe('legacy redirects into /app', () => {
    it.each(Object.entries(STATIC_REDIRECTS))('redirects %s to %s', async (from, to) => {
      renderAt(from)
      expect(
        await screen.findByRole('link', { name: navLabelFor(to) }),
      ).toHaveAttribute('aria-current', 'page')
    })

    it.each(PARAM_REDIRECTS.filter((r) => r.to !== '/app/coins/:symbol'))(
      'redirects $from to $to',
      async ({ from, to }) => {
        const concretePath = from.replace(/:\w+/, 'test-id')
        renderAt(concretePath)
        expect(
          await screen.findByRole('link', { name: navLabelFor(to) }),
        ).toHaveAttribute('aria-current', 'page')
      },
    )

    it('redirects /coins/:symbol to /app/coins/:symbol', () => {
      renderAt('/coins/BTC')
      expect(screen.getByText('BTC', { selector: 'p' })).toBeInTheDocument()
    })

    it('preserves the query string when redirecting legacy /paper to /app/lab/paper', async () => {
      renderAt('/paper?source_backtest_id=abc-123')
      // PaperStartPage reads source_backtest_id from the URL to prefill the form.
      // If the redirect dropped the query string, this prefill notice would never appear.
      expect(await screen.findByText('From backtest abc-123')).toBeInTheDocument()
    })
  })
})
