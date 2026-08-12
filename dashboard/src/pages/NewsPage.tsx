import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getNews } from '../api/news'

const POLL_INTERVAL_MS = 600_000 // matches the server's 10-minute cache

function relativeAge(iso: string | null): string | null {
  if (!iso) return null
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (Number.isNaN(minutes)) return null
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NewsPage() {
  const newsQuery = useQuery({
    queryKey: ['news'],
    queryFn: getNews,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const failed = newsQuery.isError && !newsQuery.data
  const items = newsQuery.data?.items ?? []

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold">News</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Crypto headlines, refreshed every ten minutes.
      </p>

      {newsQuery.data?.stale && (
        <p className="mb-4 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Headlines may be out of date — we couldn't reach the feeds just now.
        </p>
      )}

      {failed && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">We couldn't load the news.</p>
          <Button variant="outline" size="sm" onClick={() => newsQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {newsQuery.isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {!failed && !newsQuery.isLoading && items.length === 0 && (
        <p className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          No headlines right now — check back shortly.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const age = relativeAge(item.published_at)
          return (
            <Card
              key={item.url}
              className="transition-colors duration-200 hover:border-primary/40"
            >
              <CardContent className="p-4">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start justify-between gap-3"
                >
                  <span className="text-sm font-medium group-hover:text-primary">
                    {item.title}
                  </span>
                  <ExternalLink
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </a>
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{item.source}</span>
                  {age && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{age}</span>
                    </>
                  )}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
