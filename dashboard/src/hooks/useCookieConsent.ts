import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'hedgefund.cookieConsent'
export type ConsentChoice = 'accepted' | 'declined'

// Same pattern as useAdvisorEnabled: localStorage doesn't fire a 'storage'
// event in the tab that wrote it, so a module-level subscriber set nudges
// components in this tab; the window listener covers other tabs.
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function getSnapshot(): ConsentChoice | null {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw === 'accepted' || raw === 'declined' ? raw : null
}

export function setCookieConsent(choice: ConsentChoice): void {
  window.localStorage.setItem(STORAGE_KEY, choice)
  listeners.forEach((listener) => listener())
}

/** null means "no choice made yet" — the banner should show. */
export function useCookieConsent(): ConsentChoice | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}
