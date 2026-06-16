import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Step2Indicators } from './Step2Indicators'
import { INITIAL_FORM_STATE } from './types'

describe('Step2Indicators', () => {
  it('renders one indicator row from the initial state', () => {
    render(<Step2Indicators state={INITIAL_FORM_STATE} update={vi.fn()} />)
    expect(screen.getByDisplayValue('m1')).toBeInTheDocument()
  })

  it('adds an indicator row with an auto-incremented id when Add is clicked', async () => {
    const user = userEvent.setup()
    const update = vi.fn()
    render(<Step2Indicators state={INITIAL_FORM_STATE} update={update} />)
    await user.click(screen.getByRole('button', { name: '+ Add indicator' }))
    expect(update).toHaveBeenCalledWith({
      indicators: [
        ...INITIAL_FORM_STATE.indicators,
        { type: 'momentum', id: 'm2', param: 20, sourceId: '' },
      ],
    })
  })

  it('removes a row when its remove button is clicked', async () => {
    const user = userEvent.setup()
    const update = vi.fn()
    const state = {
      ...INITIAL_FORM_STATE,
      indicators: [
        { type: 'momentum' as const, id: 'm1', param: 20, sourceId: '' },
        { type: 'sma' as const, id: 's1', param: 50, sourceId: '' },
      ],
    }
    render(<Step2Indicators state={state} update={update} />)
    await user.click(screen.getAllByRole('button', { name: '×' })[0])
    expect(update).toHaveBeenCalledWith({
      indicators: [{ type: 'sma', id: 's1', param: 50, sourceId: '' }],
    })
  })
})
