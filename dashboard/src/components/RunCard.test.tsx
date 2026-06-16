import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { RunCard } from './RunCard'

const SUMMARY = {
  id: 'abc-123',
  name: 'momentum_2024',
  created_at: '2026-06-15T00:00:00Z',
  duration_ms: 7,
  metrics: { sharpe: 1.42, total_return: 0.64, max_drawdown: -0.18 },
}

describe('RunCard', () => {
  it('renders name and key metrics', () => {
    render(
      <MemoryRouter>
        <RunCard summary={SUMMARY} onDelete={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByText('momentum_2024')).toBeInTheDocument()
    expect(screen.getByText('1.42')).toBeInTheDocument()
    expect(screen.getByText('+64.00%')).toBeInTheDocument()
  })

  it('calls onDelete with the id when delete is clicked', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <MemoryRouter>
        <RunCard summary={SUMMARY} onDelete={onDelete} />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('abc-123')
  })
})
