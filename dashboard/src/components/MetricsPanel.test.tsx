import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricsPanel } from './MetricsPanel'

describe('MetricsPanel', () => {
  it('renders core metrics with human labels', () => {
    render(
      <MetricsPanel
        metrics={{ sharpe: 1.42, total_return: 0.64, max_drawdown: -0.18 }}
      />,
    )
    expect(screen.getByText('Sharpe')).toBeInTheDocument()
    expect(screen.getByText('1.42')).toBeInTheDocument()
    expect(screen.getByText('Total Return')).toBeInTheDocument()
    expect(screen.getByText('+64.00%')).toBeInTheDocument()
  })

  it('skips metric keys it does not recognize', () => {
    render(<MetricsPanel metrics={{ sharpe: 1.0, mystery_key: 9 }} />)
    expect(screen.queryByText('9')).not.toBeInTheDocument()
  })
})
