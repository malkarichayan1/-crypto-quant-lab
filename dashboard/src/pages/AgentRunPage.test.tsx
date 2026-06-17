import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AgentRunPage } from './AgentRunPage'

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AgentRunPage', () => {
  it('renders the form', () => {
    wrap(<AgentRunPage />)
    expect(screen.getByRole('heading', { name: /new research run/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /launch/i })).toBeInTheDocument()
  })

  it('launch button disabled when goal is empty', () => {
    wrap(<AgentRunPage />)
    expect(screen.getByRole('button', { name: /launch/i })).toBeDisabled()
  })
})
