import { useEffect } from 'react'

/**
 * Sets document.title, the <meta name="description"> tag, and a
 * self-referencing <link rel="canonical"> tag for as long as the calling
 * component is mounted, restoring the previous values on unmount. This app
 * is a client-only SPA with no SSR to coordinate with, so a direct DOM hook
 * is simpler than pulling in react-helmet-async.
 *
 * The canonical href is read fresh from window.location on every render
 * (rather than derived from `title`/`description`) so it tracks the current
 * route even when a caller like PageMetaSync stays mounted across
 * navigations whose title/description happen not to change (e.g. two
 * dynamic siblings matching the same pattern).
 */
export function usePageMeta(title: string, description: string): void {
  const canonicalHref = `${window.location.origin}${window.location.pathname}`

  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    let metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const isNewDescriptionTag = !metaDescription
    if (!metaDescription) {
      metaDescription = document.createElement('meta')
      metaDescription.name = 'description'
      document.head.appendChild(metaDescription)
    }
    const previousDescription = metaDescription.content
    metaDescription.content = description

    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const isNewCanonicalTag = !canonicalLink
    if (!canonicalLink) {
      canonicalLink = document.createElement('link')
      canonicalLink.rel = 'canonical'
      document.head.appendChild(canonicalLink)
    }
    const previousCanonicalHref = canonicalLink.href
    canonicalLink.href = canonicalHref

    return () => {
      document.title = previousTitle

      if (isNewDescriptionTag) {
        metaDescription?.remove()
      } else if (metaDescription) {
        metaDescription.content = previousDescription
      }

      if (isNewCanonicalTag) {
        canonicalLink?.remove()
      } else if (canonicalLink) {
        canonicalLink.href = previousCanonicalHref
      }
    }
  }, [title, description, canonicalHref])
}
