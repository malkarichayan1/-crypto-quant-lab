import { useState } from 'react'
import type { SpecFormState } from './types'

interface Props {
  state: SpecFormState
  update: (patch: Partial<SpecFormState>) => void
}

export function Step3Selection({ state, update }: Props) {
  const [longTop, setLongTop] = useState(state.longTop)
  const [shortBottom, setShortBottom] = useState(state.shortBottom)

  return (
    <div className="step">
      <label>
        Mode
        <input value="cross_sectional" readOnly />
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
          value={longTop}
          onChange={(e) => {
            const n = Number(e.target.value)
            setLongTop(n)
            update({ longTop: n })
          }}
        />
      </label>
      <label>
        Short bottom N
        <input
          type="number"
          value={shortBottom}
          onChange={(e) => {
            const n = Number(e.target.value)
            setShortBottom(n)
            update({ shortBottom: n })
          }}
        />
      </label>
    </div>
  )
}
