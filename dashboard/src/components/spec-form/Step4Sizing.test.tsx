import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Step4Sizing } from './Step4Sizing'
import { INITIAL_FORM_STATE } from './types'

describe('Step4Sizing', () => {
  it('shows the vol indicator selector only for inverse_vol', () => {
    const { rerender } = render(
      <Step4Sizing state={INITIAL_FORM_STATE} update={vi.fn()} />,
    )
    expect(screen.queryByLabelText('Vol indicator')).not.toBeInTheDocument()

    rerender(
      <Step4Sizing
        state={{ ...INITIAL_FORM_STATE, sizingScheme: 'inverse_vol' }}
        update={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Vol indicator')).toBeInTheDocument()
  })

  it('updates fee bps when changed', () => {
    const update = vi.fn()
    render(<Step4Sizing state={INITIAL_FORM_STATE} update={update} />)
    const input = screen.getByLabelText('Fee (bps)') as HTMLInputElement
    // For prop-controlled number inputs, use fireEvent to trigger onChange
    fireEvent.change(input, { target: { value: '20' } })
    expect(update).toHaveBeenLastCalledWith({ feeBps: 20 })
  })
})
