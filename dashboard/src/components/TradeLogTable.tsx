import { useState } from 'react'

type Props = {
  trades: Record<string, unknown>[]
}

const COLUMNS = ['date', 'symbol', 'units', 'price'] as const

export function TradeLogTable({ trades }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="trade-log">
      <button type="button" onClick={() => setOpen((o) => !o)}>
        {open ? '▼' : '▶'} Trade Log ({trades.length} trades)
      </button>
      {open && (
        <table>
          <thead>
            <tr>{COLUMNS.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => (
              <tr key={i}>
                {COLUMNS.map((c) => <td key={c}>{String(trade[c] ?? '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
