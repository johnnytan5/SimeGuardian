import { useEffect, useState } from 'react'
import { SERVER_URL } from './api'
import { fetchWithTimeout } from './timeout'

// Polls a server view once a second. Reports an error only after 3 misses in a row
// so one dropped request on flaky Wi-Fi doesn't flash the offline screen.
export function usePoll<T>(path: string): { view: T | null; error: string | null } {
  const [view, setView] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let misses = 0
    let alive = true
    let inFlight = false
    setView(null)
    const poll = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const r = await fetchWithTimeout(SERVER_URL + path, 2000)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const v: T = await r.json()
        if (!alive) return
        misses = 0
        setView(v)
        setError(null)
      } catch (e) {
        if (alive && ++misses >= 3) setError(String(e))
      } finally {
        inFlight = false
      }
    }
    poll()
    const t = setInterval(poll, 1000)
    return () => { alive = false; clearInterval(t) }
  }, [path])

  return { view, error }
}
