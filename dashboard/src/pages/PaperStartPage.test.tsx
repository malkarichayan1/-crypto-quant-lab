import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PaperStartPage } from './PaperStartPage'

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PaperStartPage', () => {
  it('renders the form with a launch button', () => {
    wrap(<PaperStartPage />)
    expect(screen.getByRole('heading', { name: /start paper session/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /launch/i })).toBeInTheDocument()
  })
})
