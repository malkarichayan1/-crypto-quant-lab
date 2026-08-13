import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AssetRow } from './AssetRow'
import type { AssetQuote } from '../types'

const btc: AssetQuote = {
  symbol: 'BTC',
  name: 'Bitcoin',
  price: 64231.5,
  change_24h_pct: 0.0231,
  high_24h: 65000,
  low_24h: 63000,
  volume_24h: 1_000_000,
  sparkline: [63000, 63500, 64231.5],
}

function renderRow(overrides: Partial<Parameters<typeof AssetRow>[0]> = {}) {
  const onToggleStar = vi.fn()
  render(
    <MemoryRouter>
      <AssetRow asset={btc} isStarred={false} onToggleStar={onToggleStar} {...overrides} />
    </MemoryRouter>,
  )
  return { onToggleStar }
}

describe('AssetRow', () => {
  it('links to the trade view and shows name, price, and change', () => {
    renderRow()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/coins/BTC')
    expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('$64,231.50')).toBeInTheDocument()
    expect(screen.getByText('+2.31%')).toBeInTheDocument()
  })

  it('toggles the star without navigating', async () => {
    const { onToggleStar } = renderRow()
    await userEvent.click(screen.getByRole('button', { name: /add btc to watchlist/i }))
    expect(onToggleStar).toHaveBeenCalledWith('BTC')
  })

  it('labels the star for removal when starred', () => {
    renderRow({ isStarred: true })
    expect(
      screen.getByRole('button', { name: /remove btc from watchlist/i }),
    ).toBeInTheDocument()
  })
})
