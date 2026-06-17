type Props = { positions: Record<string, number> }

export function HoldingsTable({ positions }: Props) {
  const entries = Object.entries(positions)
  if (entries.length === 0) return <p className="muted">No open positions.</p>
  return (
    <table className="holdings-table">
      <thead><tr><th>Symbol</th><th>Units</th></tr></thead>
      <tbody>
        {entries.map(([symbol, units]) => (
          <tr key={symbol}><td>{symbol}</td><td>{units.toFixed(6)}</td></tr>
        ))}
      </tbody>
    </table>
  )
}
