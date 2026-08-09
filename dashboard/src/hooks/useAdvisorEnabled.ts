import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'hedgefund.advisorEnabled'

// A module-level subscriber set: localStorage does not fire a 'storage' event
// in the tab that wrote it, so components in this tab need an explicit nudge
// to re-read. The window listener covers other tabs.
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function getSnapshot(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) !== 'false'
}

export function setAdvisorEnabled(enabled: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, String(enabled))
  listeners.forEach((listener) => listener())
}

/**
 * User-facing advisor preference, persisted in localStorage.
 *
 * A display preference only. MANUAL_ADVISOR_ENABLED on the server is the real
 * kill switch — this cannot cause LLM spend on its own, since advice is
 * generated only by an explicit click.
 */
export function useAdvisorEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
