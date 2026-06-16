import type { SizingScheme, SpecFormState } from './types'

type Props = {
  state: SpecFormState
  update: (patch: Partial<SpecFormState>) => void
}

const SCHEMES: SizingScheme[] = ['equal_weight', 'inverse_vol', 'fixed_fraction']

export function Step4Sizing({ state, update }: Props) {

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
          value={state.grossLeverage}
          onChange={(e) => update({ grossLeverage: Number(e.target.value) })}
        />
      </label>

      {state.sizingScheme === 'fixed_fraction' && (
        <label>
          Fraction
          <input
            type="number"
            step="0.01"
            value={state.fraction}
            onChange={(e) => update({ fraction: Number(e.target.value) })}
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
          value={state.feeBps}
          onChange={(e) => update({ feeBps: Number(e.target.value) })}
        />
      </label>

      <label>
        Slippage (bps)
        <input
          type="number"
          value={state.slippageBps}
          onChange={(e) => update({ slippageBps: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
