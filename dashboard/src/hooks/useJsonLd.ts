import { useEffect } from 'react'

/**
 * Injects a <script type="application/ld+json"> tag into document.head for
 * as long as the calling component is mounted, removing it on unmount.
 * `id` scopes the tag so multiple structured-data blocks can coexist.
 * Callers should pass a stable `data` reference (e.g. a module-level
 * constant) — a fresh object literal on every render would re-run this
 * effect on every render too.
 */
export function useJsonLd(id: string, data: unknown): void {
  useEffect(() => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.dataset.jsonLdId = id
    script.textContent = JSON.stringify(data)
    document.head.appendChild(script)

    return () => {
      script.remove()
    }
  }, [id, data])
}
