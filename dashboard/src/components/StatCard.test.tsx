import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from './StatCard'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Portfolio Value" value="$100,000.00" />)
    expect(screen.getByText('Portfolio Value')).toBeInTheDocument()
    expect(screen.getByText('$100,000.00')).toBeInTheDocument()
  })

  it('colors the sub line by tone', () => {
    render(<StatCard label="Today's P/L" value="+$50.00" sub="+0.05%" tone="profit" />)
    expect(screen.getByText('+0.05%')).toHaveClass('text-profit')
  })
})
