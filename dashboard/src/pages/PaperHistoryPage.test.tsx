import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PaperHistoryPage } from './PaperHistoryPage'

vi.mock('../api/paperSessions', () => ({ listPaperSessions: vi.fn().mockResolvedValue([]) }))

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PaperHistoryPage', () => {
  it('shows empty state', async () => {
    wrap(<PaperHistoryPage />)
    expect(await screen.findByText(/no paper sessions yet/i)).toBeInTheDocument()
  })
})
