import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createPaperSession } from '../api/paperSessions'
import type { CreatePaperSessionRequest } from '../types'

export function PaperStartPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefillBacktestId = params.get('source_backtest_id')

  const [label, setLabel] = useState('')
  const [specText, setSpecText] = useState('')
  const [startingCash, setStartingCash] = useState(10000)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setPending(true)
    setError(null)
    const body: CreatePaperSessionRequest = prefillBacktestId
      ? { label, source_backtest_id: prefillBacktestId, starting_cash: startingCash }
      : { label, spec_json: safeParse(specText), starting_cash: startingCash }
    try {
      const session = await createPaperSession(body)
      navigate(`/paper/sessions/${session.id}`)
    } catch (err) {
      setError((err as Error).message)
      setPending(false)
    }
  }

  return (
    <div>
      <h2>Start Paper Session</h2>
      {prefillBacktestId && <p className="muted">From backtest {prefillBacktestId}</p>}
      {error && <p className="neg" role="alert">{error}</p>}
      <form className="paper-form" onSubmit={handleSubmit}>
        <label>Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} required />
        </label>
        {!prefillBacktestId && (
          <label>Strategy spec (JSON)
            <textarea value={specText} onChange={(e) => setSpecText(e.target.value)}
              placeholder='{"name": "...", "universe": ["BTC/USDT"], ...}' />
          </label>
        )}
        <label>Starting cash ($)
          <input type="number" value={startingCash}
            onChange={(e) => setStartingCash(Number(e.target.value))} />
        </label>
        <button type="submit" disabled={pending || !label.trim()}>
          {pending ? 'Launching…' : 'Launch'}
        </button>
      </form>
    </div>
  )
}

function safeParse(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) } catch { return null }
}
