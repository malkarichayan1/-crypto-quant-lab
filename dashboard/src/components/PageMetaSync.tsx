import { matchRoutes, useLocation } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { APP_PAGE_META, FALLBACK_PAGE_META, type PageMetaEntry } from '../routes/pageMeta'

// RouteObject.handle is `unknown` by design — we stash the full
// PageMetaEntry there so it can be read back off whichever match
// matchRoutes ranks best, without a second array to keep in sync.
const ROUTES: RouteObject[] = APP_PAGE_META.map((entry) => ({
  path: entry.pattern,
  handle: entry,
}))

/**
 * Mounted once inside AppShell. Resolves the current route with
 * react-router-dom's matchRoutes — the same specificity-ranked matcher
 * App.tsx's <Routes> uses internally — so a static route like
 * /app/lab/backtests/history always outranks a same-shape dynamic
 * sibling like /app/lab/backtests/:id, regardless of APP_PAGE_META's
 * array order. A plain APP_PAGE_META.find(...) would instead return
 * whichever entry happened to come first in the array. Syncs
 * document.title / meta description via usePageMeta — one place to keep
 * every /app/* page's SEO metadata correct, instead of a hook call
 * duplicated across sixteen page files.
 */
export function PageMetaSync() {
  const location = useLocation()
  const [bestMatch] = matchRoutes(ROUTES, location.pathname) ?? []
  const entry = (bestMatch?.route.handle as PageMetaEntry | undefined) ?? FALLBACK_PAGE_META
  usePageMeta(entry.title, entry.description)
  return null
}
