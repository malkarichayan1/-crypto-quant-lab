import { Link } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'

const LAST_UPDATED = 'August 13, 2026'

export function PrivacyPolicyPage() {
  usePageMeta(
    'Privacy Policy — HedgeFund Simulator',
    'What HedgeFund Simulator collects, why, and the choices you have.',
  )

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <div>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to home
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </div>

      <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        This page is a plain-language description of what this app actually does, written by
        the people who built it — not a lawyer. It has not been reviewed by legal counsel. If
        you need this to be legally binding (for example, because you expect visitors in the
        EU or California), have it reviewed before relying on it.
      </p>

      <section>
        <h2 className="mb-2 text-xl font-semibold">No account required</h2>
        <p className="text-muted-foreground">
          HedgeFund Simulator has no sign-up, no login, and no passwords. There is one shared
          demo portfolio that every visitor sees and trades against — we don't attach any of
          your activity to your identity, because we have no way to know who you are.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">What we store locally in your browser</h2>
        <p className="text-muted-foreground">
          Two small preferences live in your browser's local storage and never leave your
          device: whether you've turned the AI advisor on or off, and your cookie-consent
          choice from the banner. Clearing your browser storage clears both.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">Analytics cookies</h2>
        <p className="text-muted-foreground">
          If you accept the cookie banner, we load Google Analytics to understand which pages
          are visited and how often. It only loads after you accept — declining, or not
          answering, means it never loads. You can change your mind at any time by clearing
          your browser's storage for this site, which brings the banner back.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">If you sign up to be notified</h2>
        <p className="text-muted-foreground">
          If you submit your email through the "Get notified about new features" form, we
          store that email address so we can contact you about the product. We don't sell or
          share it with anyone else. Email us (below) if you'd like it removed.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">Server logs</h2>
        <p className="text-muted-foreground">
          Like effectively every website, our hosting infrastructure keeps standard access
          logs (IP address, timestamp, requested path) for operating and securing the
          service. We don't use these logs for tracking or analytics.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">Contact</h2>
        <p className="text-muted-foreground">
          Questions about this policy or your data?{' '}
          <a
            href="mailto:malkarichayan1@gmail.com"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Email us
          </a>
          .
        </p>
      </section>
    </main>
  )
}
