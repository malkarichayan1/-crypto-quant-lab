import { useEffect, useState } from 'react'

const DEFAULT_DELAY_MS = 3000

/**
 * Reports whether a request has been pending long enough to be worth
 * explaining to the user.
 *
 * The warm-up ping on the landing page hides most of Render's free-tier cold
 * start, but it can't hide all of it — a visitor deep-linking straight to
 * /app, or arriving after the service has idled down, still waits. Rather
 * than leave them staring at skeletons wondering if the app is broken, this
 * flips true after `delayMs` so the UI can say what's actually happening.
 *
 * The delay matters: firing immediately would flash the notice on every
 * normal load, which trains people to ignore it.
 */
export function useSlowLoadNotice(
  isPending: boolean,
  delayMs: number = DEFAULT_DELAY_MS,
): boolean {
  const [isSlow, setIsSlow] = useState(false)

  useEffect(() => {
    if (!isPending) {
      setIsSlow(false)
      return
    }

    const timer = setTimeout(() => setIsSlow(true), delayMs)
    return () => clearTimeout(timer)
  }, [isPending, delayMs])

  return isSlow
}
