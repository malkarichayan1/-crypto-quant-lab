import { matchPath, useLocation } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { APP_PAGE_META, FALLBACK_PAGE_META } from '../routes/pageMeta'

/**
 * Mounted once inside AppShell. Looks up the current route in
 * APP_PAGE_META and syncs document.title / meta description via
 * usePageMeta — one place to keep every /app/* page's SEO metadata
 * correct, instead of a hook call duplicated across sixteen page files.
 */
export function PageMetaSync() {
  const location = useLocation()
  const entry =
    APP_PAGE_META.find((candidate) => matchPath(candidate.pattern, location.pathname)) ??
    FALLBACK_PAGE_META
  usePageMeta(entry.title, entry.description)
  return null
}
