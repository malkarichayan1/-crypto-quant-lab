import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../hooks/usePageMeta'

export function NotFoundPage() {
  usePageMeta(
    'Page not found — HedgeFund Simulator',
    "The page you're looking for doesn't exist or may have moved.",
  )

  useEffect(() => {
    // A soft 404: dashboard/vercel.json rewrites every path to index.html,
    // so Vercel always serves this with HTTP 200 — there's no real 404
    // status to rely on. This meta tag is how we tell crawlers not to
    // index it. Kept separate from usePageMeta, which only owns
    // title/description.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const isNewTag = !meta
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'robots'
      document.head.appendChild(meta)
    }
    const previousContent = meta.content
    meta.content = 'noindex'

    return () => {
      if (isNewTag) {
        meta?.remove()
      } else if (meta) {
        meta.content = previousContent
      }
    }
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Button asChild>
        <Link to="/">Back to home</Link>
      </Button>
    </main>
  )
}
