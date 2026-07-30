import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopBar } from './TopBar'

describe('TopBar', () => {
  it('renders the brand', () => {
    render(<TopBar />)
    expect(screen.getByText('HedgeFund Sim')).toBeInTheDocument()
  })

  it('renders a disabled search input until markets exist', () => {
    render(<TopBar />)
    const search = screen.getByPlaceholderText(/search coins/i)
    expect(search).toBeDisabled()
  })
})
