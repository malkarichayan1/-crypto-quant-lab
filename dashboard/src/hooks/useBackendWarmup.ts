import { useEffect } from 'react'
import { warmBackend } from '../lib/warmBackend'

/**
 * Wakes the backend as soon as the calling component mounts.
 *
 * Belongs on the public marketing surface (the landing page), not inside
 * AppShell — by the time a visitor reaches /app the real queries are already
 * firing, so a warm-up there would be too late to help.
 *
 * warmBackend() is itself idempotent, so mounting this hook on more than one
 * marketing route still results in a single ping per page load.
 */
export function useBackendWarmup(): void {
  useEffect(() => {
    warmBackend()
  }, [])
}
