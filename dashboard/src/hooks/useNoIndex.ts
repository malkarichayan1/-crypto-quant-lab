import { useEffect } from 'react'

/**
 * Sets <meta name="robots" content="noindex"> for as long as the calling
 * component is mounted, restoring the previous content (or removing the
 * tag entirely if it didn't exist) on unmount.
 *
 * Some routes in this SPA are soft-200s (dashboard/vercel.json rewrites
 * every path to index.html, so there's no real HTTP status to rely on) or
 * deliberately excluded from sitemap.xml as non-content — this is how we
 * tell crawlers not to index them. Kept separate from usePageMeta, which
 * only owns title/description/canonical.
 */
export function useNoIndex(): void {
  useEffect(() => {
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
}
