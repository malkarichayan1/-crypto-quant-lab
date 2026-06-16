import { useState } from 'react'
import type { SizingScheme, SpecFormState } from './types'

interface Props {
  state: SpecFormState
  update: (patch: Partial<SpecFormState>) => void
}

const SCHEMES: SizingScheme[] = ['equal_weight', 'inverse_vol', 'fixed_fraction']

export function Step4Sizing({ state, update }: Props) {
  const [feeBps, setFeeBps] = useState(state.feeBps)
  const [slippageBps, setSlippageBps] = useState(state.slippageBps)
  const [grossLeverage, setGrossLeverage] = useState(state.grossLeverage)
  const [fraction, setFraction] = useState(state.fraction)

  return (
    <div className="step">
      <label>
        Sizing scheme
        <select
          value={state.sizingScheme}
          onChange={(e) => update({ sizingScheme: e.target.value as SizingScheme })}
        >
          {SCHEMES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      <label>
        Gross leverage
        <input
          type="number"
          step="0.1"
          value={grossLeverage}
          onChange={(e) => {
            const n = Number(e.target.value)
            setGrossLeverage(n)
            update({ grossLeverage: n })
          }}
        />
      </label>

      {state.sizingScheme === 'fixed_fraction' && (
        <label>
          Fraction
          <input
            type="number"
            step="0.01"
            value={fraction}
            onChange={(e) => {
              const n = Number(e.target.value)
              setFraction(n)
              update({ fraction: n })
            }}
          />
        </label>
      )}

      {state.sizingScheme === 'inverse_vol' && (
        <label>
          Vol indicator
          <select
            value={state.volIndicatorId}
            onChange={(e) => update({ volIndicatorId: e.target.value })}
          >
            <option value="">select…</option>
            {state.indicators.map((ind) => (
              <option key={ind.id} value={ind.id}>{ind.id}</option>
            ))}
          </select>
        </label>
      )}

      <label>
        Rebalance
        <select
          value={state.rebalance}
          onChange={(e) => update({ rebalance: e.target.value as 'daily' | 'weekly' })}
        >
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
        </select>
      </label>

      <label>
        Fee (bps)
        <input
          type="number"
          value={feeBps}
          onChange={(e) => {
            const n = Number(e.target.value)
            setFeeBps(n)
            update({ feeBps: n })
          }}
        />
      </label>

      <label>
        Slippage (bps)
        <input
          type="number"
          value={slippageBps}
          onChange={(e) => {
            const n = Number(e.target.value)
            setSlippageBps(n)
            update({ slippageBps: n })
          }}
        />
      </label>
    </div>
  )
}
