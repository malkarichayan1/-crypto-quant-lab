import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AgentHistoryPage } from './AgentHistoryPage'

vi.mock('../api/agentRuns', () => ({
  listAgentRuns: vi.fn().mockResolvedValue([]),
}))

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AgentHistoryPage', () => {
  it('shows empty state', async () => {
    wrap(<AgentHistoryPage />)
    expect(await screen.findByText(/no research runs yet/i)).toBeInTheDocument()
  })
})
