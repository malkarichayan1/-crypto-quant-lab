import { Link } from 'react-router-dom'

export function SiteFooter() {
  return (
    <footer className="border-t border-border px-6 py-10 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <p>
          Questions?{' '}
          <a
            href="mailto:malkarichayan1@gmail.com"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Email us
          </a>{' '}
          — we typically reply within 24 hours.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-4">
          <Link to="/app/markets" className="hover:text-foreground">
            Markets
          </Link>
          <a href="#faq-heading" className="hover:text-foreground">
            FAQ
          </a>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
          <Link to="/app" className="font-medium text-foreground hover:underline">
            Start simulating
          </Link>
        </nav>
        <p className="text-xs">
          © {new Date().getFullYear()} HedgeFund Simulator. Simulated trading only — not
          financial advice.
        </p>
      </div>
    </footer>
  )
}
