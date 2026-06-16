import type { IndicatorRow, IndicatorType, SpecFormState } from './types'

interface Props {
  state: SpecFormState
  update: (patch: Partial<SpecFormState>) => void
}

const TYPES: IndicatorType[] = ['momentum', 'sma', 'rsi', 'volatility', 'zscore']

function paramLabel(type: IndicatorType): string {
  return type === 'sma' || type === 'rsi' ? 'period' : 'lookback'
}

export function Step2Indicators({ state, update }: Props) {
  function setRow(index: number, patch: Partial<IndicatorRow>) {
    const next = state.indicators.map((row, i) =>
      i === index ? { ...row, ...patch } : row,
    )
    update({ indicators: next })
  }

  function addRow() {
    const nextId = `m${state.indicators.length + 1}`
    update({
      indicators: [
        ...state.indicators,
        { type: 'momentum', id: nextId, param: 20, sourceId: '' },
      ],
    })
  }

  function removeRow(index: number) {
    update({ indicators: state.indicators.filter((_, i) => i !== index) })
  }

  return (
    <div className="step">
      {state.indicators.map((row, i) => (
        <div className="indicator-row" key={i}>
          <select
            aria-label="type"
            value={row.type}
            onChange={(e) => setRow(i, { type: e.target.value as IndicatorType })}
          >
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            aria-label="id"
            value={row.id}
            onChange={(e) => setRow(i, { id: e.target.value })}
          />
          <input
            aria-label={paramLabel(row.type)}
            type="number"
            value={row.param}
            onChange={(e) => setRow(i, { param: Number(e.target.value) })}
          />
          {row.type === 'zscore' && (
            <select
              aria-label="source_id"
              value={row.sourceId}
              onChange={(e) => setRow(i, { sourceId: e.target.value })}
            >
              <option value="">source…</option>
              {state.indicators
                .filter((other) => other.id !== row.id)
                .map((other) => (
                  <option key={other.id} value={other.id}>{other.id}</option>
                ))}
            </select>
          )}
          <button type="button" onClick={() => removeRow(i)}>×</button>
        </div>
      ))}
      <button type="button" onClick={addRow}>+ Add indicator</button>
    </div>
  )
}
