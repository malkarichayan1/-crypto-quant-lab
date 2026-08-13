import { matchRoutes, useLocation } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { APP_PAGE_META, FALLBACK_PAGE_META, type PageMetaEntry } from '../routes/pageMeta'

/**
 * Picks which PageMetaEntry applies to `pathname`, ranking candidates by
 * specificity via react-router-dom's matchRoutes — the same ranking
 * App.tsx's <Routes> uses internally — so a static route like
 * /app/lab/backtests/history always outranks a same-shape dynamic
 * sibling like /app/lab/backtests/:id, regardless of `entries`' array
 * order. A plain entries.find(...) would instead return whichever entry
 * happened to come first in the array. Exported as a standalone,
 * side-effect-free function (rather than inlined in PageMetaSync) so
 * this ranking behavior can be pinned against a small synthetic entries
 * array in tests, independent of whatever order the real APP_PAGE_META
 * table happens to have today.
 */
export function resolvePageMeta(
  entries: PageMetaEntry[],
  fallback: PageMetaEntry,
  pathname: string,
): PageMetaEntry {
  // RouteObject.handle is `unknown` by design — we stash the full
  // PageMetaEntry there so it can be read back off whichever match
  // matchRoutes ranks best, without a second array to keep in sync.
  const routes: RouteObject[] = entries.map((entry) => ({ path: entry.pattern, handle: entry }))
  const [bestMatch] = matchRoutes(routes, pathname) ?? []
  return (bestMatch?.route.handle as PageMetaEntry | undefined) ?? fallback
}

/**
 * Mounted once inside AppShell. Syncs document.title / meta description
 * via usePageMeta for whichever /app/* route is active — one place to
 * keep every page's SEO metadata correct, instead of a hook call
 * duplicated across sixteen page files.
 */
export function PageMetaSync() {
  const location = useLocation()
  const entry = resolvePageMeta(APP_PAGE_META, FALLBACK_PAGE_META, location.pathname)
  usePageMeta(entry.title, entry.description)
  return null
}
