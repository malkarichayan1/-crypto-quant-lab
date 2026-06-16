import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SpecForm } from './SpecForm'

describe('SpecForm', () => {
  it('starts on Step 1 (Strategy) and shows the name field', () => {
    render(<SpecForm onSubmit={vi.fn()} pending={false} />)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('advances to Step 2 when Next is clicked', async () => {
    const user = userEvent.setup()
    render(<SpecForm onSubmit={vi.fn()} pending={false} />)
    await user.click(screen.getByRole('button', { name: 'Next →' }))
    expect(screen.getByRole('heading', { name: 'Step 2 — Indicators' })).toBeInTheDocument()
  })

  it('goes back to Step 1 from Step 2', async () => {
    const user = userEvent.setup()
    render(<SpecForm onSubmit={vi.fn()} pending={false} />)
    await user.click(screen.getByRole('button', { name: 'Next →' }))
    await user.click(screen.getByRole('button', { name: '← Back' }))
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })
})
