import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { RedirectWithParams } from './RedirectWithParams'

function Probe() {
  const { id } = useParams()
  return <p>landed with id {id}</p>
}

describe('RedirectWithParams', () => {
  it('redirects preserving route params', () => {
    render(
      <MemoryRouter initialEntries={['/backtests/42']}>
        <Routes>
          <Route path="/backtests/:id" element={<RedirectWithParams to="/lab/backtests/:id" />} />
          <Route path="/lab/backtests/:id" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('landed with id 42')).toBeInTheDocument()
  })
})
