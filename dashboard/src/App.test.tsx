import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
// these prefixes. '/app' is checked last since it's a prefix of every
// other entry here.
const NAV_LABEL_FOR_APP_PREFIX: Array<{ prefix: string; label: RegExp }> = [
  { prefix: '/app/markets', label: /markets/i },
  { prefix: '/app/portfolio', label: /portfolio/i },
  { prefix: '/app/leaderboard', label: /leaderboard/i },
  { prefix: '/app/news', label: /news/i },
  { prefix: '/app/settings', label: /settings/i },
  { prefix: '/app', label: /dashboard/i },
]

function navLabelFor(appPath: string): RegExp {
  const match = NAV_LABEL_FOR_APP_PREFIX.find(({ prefix }) => appPath.startsWith(prefix))
  if (!match) throw new Error(`No nav section mapped for ${appPath}`)
  return match.label
}

describe('App routing', () => {
  beforeEach(() => {
    // Most /app pages fetch on mount; a never-resolving fetch keeps them in
    // loading state, which is all these routing tests need to assert on.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  })

  it('renders the landing page at /', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    const ctas = screen.getAllByRole('link', { name: /start simulating/i })
    expect(ctas.length).toBeGreaterThan(0)
    for (const cta of ctas) {
      expect(cta).toHaveAttribute('href', '/app')
    }
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

  it('renders the Learn page at /app/learn', () => {
    renderAt('/app/learn')
    expect(screen.getByRole('heading', { name: 'Learn' })).toBeInTheDocument()
  })

  it('shows the cookie consent banner on first visit', () => {
    renderAt('/')
    expect(screen.getByRole('button', { name: /^accept$/i })).toBeInTheDocument()
  })

  it('renders the thank-you page at /thank-you', () => {
    renderAt('/thank-you')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start simulating/i })).toHaveAttribute(
      'href',
      '/app',
    )
  })

  it('renders the Privacy Policy page at /privacy', () => {
    renderAt('/privacy')
    expect(screen.getByRole('heading', { level: 1, name: /privacy policy/i })).toBeInTheDocument()
  })

  it('renders the 404 page for an unknown path with a noindex meta tag', () => {
    renderAt('/this-page-does-not-exist')
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  describe('legacy redirects into /app', () => {
    // Scoped to the Sidebar nav landmark: some destination pages (e.g.
    // AgentResultPage) also render a Breadcrumbs trail whose link can share
    // the same accessible name (e.g. "Research"), so an unscoped query would
    // match more than one link.
    it.each(Object.entries(STATIC_REDIRECTS))('redirects %s to %s', async (from, to) => {
      renderAt(from)
      const nav = screen.getByRole('navigation', { name: /main navigation/i })
      expect(
        await within(nav).findByRole('link', { name: navLabelFor(to) }),
      ).toHaveAttribute('aria-current', 'page')
    })

    it.each(PARAM_REDIRECTS.filter((r) => r.to !== '/app/coins/:symbol'))(
      'redirects $from to $to',
      async ({ from, to }) => {
        const concretePath = from.replace(/:\w+/, 'test-id')
        renderAt(concretePath)
        const nav = screen.getByRole('navigation', { name: /main navigation/i })
        expect(
          await within(nav).findByRole('link', { name: navLabelFor(to) }),
        ).toHaveAttribute('aria-current', 'page')
      },
    )

    it('redirects /coins/:symbol to /app/coins/:symbol', () => {
      renderAt('/coins/BTC')
      expect(screen.getByText('BTC', { selector: 'p' })).toBeInTheDocument()
    })
  })
})
