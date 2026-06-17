import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SYMBOLS } from '../constants'
import { createAgentRun } from '../api/agentRuns'
import type { CreateAgentRunRequest } from '../types'

const METRIC_OPTIONS = ['sharpe', 'total_return', 'max_drawdown']

export function AgentRunPage() {
  const navigate = useNavigate()
  const [goal, setGoal] = useState('')
  const [universe, setUniverse] = useState<string[]>(['BTC/USDT'])
  const [dateStart, setDateStart] = useState('2022-01-01')
  const [dateEnd, setDateEnd] = useState('2023-12-31')
  const [startingCash, setStartingCash] = useState(10000)
  const [budgetUsd, setBudgetUsd] = useState(1.0)
  const [targetMetric, setTargetMetric] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSymbol(sym: string) {
    setUniverse((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!goal.trim()) return
    setPending(true)
    setError(null)
    const body: CreateAgentRunRequest = {
      goal,
      universe,
      date_start: dateStart,
      date_end: dateEnd,
      starting_cash: startingCash,
      budget_usd: budgetUsd,
      target_metric: targetMetric || null,
      target_value: targetValue ? Number(targetValue) : null,
    }
    try {
      const run = await createAgentRun(body)
      navigate(`/research/runs/${run.id}`)
    } catch (err) {
      setError((err as Error).message)
      setPending(false)
    }
  }

  return (
    <div>
      <h2>New Research Run</h2>
      {error && <p className="neg" role="alert">{error}</p>}
      <form className="agent-form" onSubmit={handleSubmit}>
        <label>
          Goal
          <textarea
            aria-label="Goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Maximize Sharpe ratio on BTC momentum strategies"
            required
          />
        </label>

        <fieldset>
          <legend>Universe</legend>
          <div className="symbol-grid">
            {SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                className={universe.includes(sym) ? 'primary' : ''}
                onClick={() => toggleSymbol(sym)}
              >
                {sym}
              </button>
            ))}
          </div>
        </fieldset>

        <label>
          Start date
          <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
        </label>
        <label>
          End date
          <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
        </label>
        <label>
          Starting cash ($)
          <input
            type="number"
            value={startingCash}
            onChange={(e) => setStartingCash(Number(e.target.value))}
          />
        </label>
        <label>
          Budget (USD)
          <input
            type="number"
            step="0.01"
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(Number(e.target.value))}
          />
        </label>
        <label>
          Target metric (optional)
          <select value={targetMetric} onChange={(e) => setTargetMetric(e.target.value)}>
            <option value="">— none —</option>
            {METRIC_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        {targetMetric && (
          <label>
            Target value
            <input
              type="number"
              step="0.01"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
          </label>
        )}
        <button
          type="submit"
          className="primary"
          disabled={pending || !goal.trim() || universe.length === 0}
        >
          {pending ? 'Launching…' : 'Launch'}
        </button>
      </form>
    </div>
  )
}
