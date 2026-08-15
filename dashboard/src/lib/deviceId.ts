const STORAGE_KEY = 'hedgefund-device-id'

/**
 * A random, opaque per-browser identity — not an auth credential — used to
 * keep each visitor's manual-trading portfolio/watchlist private without
 * requiring login. Generated once and persisted in localStorage; sent as
 * the X-Device-Id header on every API request (see api/client.ts).
 */
export function getDeviceId(): string {
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing) return existing

  const id = crypto.randomUUID()
  localStorage.setItem(STORAGE_KEY, id)
  return id
}
