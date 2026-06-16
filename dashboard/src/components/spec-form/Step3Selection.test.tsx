import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Step3Selection } from './Step3Selection'
import { INITIAL_FORM_STATE } from './types'

describe('Step3Selection', () => {
  it('populates the rank-by dropdown from indicator ids', () => {
    const state = {
      ...INITIAL_FORM_STATE,
      indicators: [
        { type: 'momentum' as const, id: 'm1', param: 20, sourceId: '' },
        { type: 'sma' as const, id: 's1', param: 50, sourceId: '' },
      ],
    }
    render(<Step3Selection state={state} update={vi.fn()} />)
    const select = screen.getByLabelText('Rank by') as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toEqual(['m1', 's1'])
  })

  it('updates long_top when changed', async () => {
    const update = vi.fn()
    render(<Step3Selection state={INITIAL_FORM_STATE} update={update} />)
    const input = screen.getByLabelText('Long top N') as HTMLInputElement
    fireEvent.change(input, { target: { value: '5' } })
    expect(update).toHaveBeenLastCalledWith({ longTop: 5 })
  })
})
