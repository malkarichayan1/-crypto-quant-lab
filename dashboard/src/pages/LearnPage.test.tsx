import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LearnPage } from './LearnPage'

describe('LearnPage', () => {
  it('renders a heading and at least one lesson card', () => {
    render(<LearnPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Learn' })).toBeInTheDocument()
    expect(screen.getByText('How this simulator works')).toBeInTheDocument()
  })

  it('does not describe order types the app does not support', () => {
    render(<LearnPage />)
    // This app only fills orders at the live market price (no limit orders) —
    // a regression here would mean the copy drifted from real app behavior.
    expect(screen.queryByText(/limit order/i)).not.toBeInTheDocument()
  })
})
