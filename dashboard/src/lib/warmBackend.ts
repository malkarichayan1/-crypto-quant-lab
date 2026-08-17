import { API_BASE_URL } from '../api/config'

let hasWarmed = false

/**
 * Fires a single throwaway GET at /health to wake the backend.
 *
 * Render's free tier spins the API down after ~15 min idle, and the first
 * request back in can take the better part of a minute. The landing page is
 * pure marketing — it fetches nothing — so the seconds a visitor spends
 * reading it are free warm-up time. Pinging on landing-page mount overlaps
 * the cold start with that reading time, so the dashboard's first real query
 * lands on an already-awake process.
 *
 * Deliberately NOT routed through apiFetch: that sets X-Device-Id, parses
 * JSON, and throws on non-2xx. None of it matters here — we only care that
 * the request reaches the origin and starts the process. The result is
 * discarded and errors are swallowed; a failed warm-up must never surface to
 * the user, because the real queries report their own failures.
 *
 * Deliberately NOT aborted on unmount either: the request outliving the
 * landing page is the entire point, since the visitor navigating to /app is
 * exactly when we need it still in flight.
 */
export function warmBackend(): void {
  if (hasWarmed) return
  hasWarmed = true

  void fetch(`${API_BASE_URL}/health`, { method: 'GET', cache: 'no-store' }).catch(
    () => {},
  )
}
