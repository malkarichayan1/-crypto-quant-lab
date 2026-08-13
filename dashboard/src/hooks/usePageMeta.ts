import { useEffect } from 'react'

/**
 * Sets document.title and the <meta name="description"> tag for as long as
 * the calling component is mounted, restoring the previous values on
 * unmount. This app is a client-only SPA with no SSR to coordinate with, so
 * a direct DOM hook is simpler than pulling in react-helmet-async.
 */
export function usePageMeta(title: string, description: string): void {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const isNewTag = !meta
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    const previousDescription = meta.content
    meta.content = description

    return () => {
      document.title = previousTitle
      if (isNewTag) {
        meta?.remove()
      } else if (meta) {
        meta.content = previousDescription
      }
    }
  }, [title, description])
}
