import type { SpecFormState } from './types'

type Props = {
  state: SpecFormState
  update: (patch: Partial<SpecFormState>) => void
}

export function Step3Selection({ state, update }: Props) {
  return (
    <div className="step">
      <label>
        Mode
        <span>cross_sectional</span>
      </label>
      <label>
        Rank by
        <select
          value={state.rankBy}
          onChange={(e) => update({ rankBy: e.target.value })}
        >
          {state.indicators.map((ind) => (
            <option key={ind.id} value={ind.id}>{ind.id}</option>
          ))}
        </select>
      </label>
      <label>
        Long top N
        <input
          type="number"
          value={state.longTop}
          onChange={(e) => update({ longTop: Number(e.target.value) })}
        />
      </label>
      <label>
        Short bottom N
        <input
          type="number"
          value={state.shortBottom}
          onChange={(e) => update({ shortBottom: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
