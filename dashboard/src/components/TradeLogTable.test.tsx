import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TradeLogTable } from './TradeLogTable'

const TRADES = [
  { date: '2021-01-02', symbol: 'BTC/USDT', units: 0.5, price: 30000 },
]

describe('TradeLogTable', () => {
  it('is collapsed by default and expands on click', async () => {
    const user = userEvent.setup()
    render(<TradeLogTable trades={TRADES} />)
    expect(screen.queryByText('BTC/USDT')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /trade log/i }))
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
  })
})
