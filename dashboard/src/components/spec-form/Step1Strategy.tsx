import { SYMBOLS } from '../../constants'
import type { SpecFormState } from './types'

interface Props {
  state: SpecFormState
  update: (patch: Partial<SpecFormState>) => void
}

export function Step1Strategy({ state, update }: Props) {
  function toggleSymbol(sym: string) {
    const next = state.universe.includes(sym)
      ? state.universe.filter((s) => s !== sym)
      : [...state.universe, sym]
    update({ universe: next })
  }

  return (
    <div className="step">
      <label>
        Name
        <input
          value={state.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </label>

      <fieldset>
        <legend>Universe</legend>
        <div className="symbol-grid">
          {SYMBOLS.map((sym) => (
            <button
              key={sym}
              type="button"
              className={state.universe.includes(sym) ? 'primary' : ''}
              onClick={() => toggleSymbol(sym)}
            >
              {sym}
            </button>
          ))}
        </div>
      </fieldset>

      <label>
        Benchmark
        <select
          value={state.benchmark}
          onChange={(e) => update({ benchmark: e.target.value })}
        >
          {SYMBOLS.map((sym) => <option key={sym} value={sym}>{sym}</option>)}
        </select>
      </label>

      <label>
        Start date
        <input
          type="date"
          value={state.start}
          onChange={(e) => update({ start: e.target.value })}
        />
      </label>

      <label>
        End date
        <input
          type="date"
          value={state.end}
          onChange={(e) => update({ end: e.target.value })}
        />
      </label>

      <label>
        Starting cash
        <input
          type="number"
          value={state.startingCash}
          onChange={(e) => update({ startingCash: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
