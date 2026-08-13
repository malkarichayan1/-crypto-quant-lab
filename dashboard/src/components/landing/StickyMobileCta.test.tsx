import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StickyMobileCta } from './StickyMobileCta'

describe('StickyMobileCta', () => {
  it('renders a CTA into the app, hidden above the sm breakpoint', () => {
    render(
      <MemoryRouter>
        <StickyMobileCta />
      </MemoryRouter>,
    )
    const bar = screen.getByTestId('sticky-mobile-cta')
    expect(bar.className).toContain('sm:hidden')
    const link = screen.getByRole('link', { name: /start simulating/i })
    expect(link).toHaveAttribute('href', '/app')
  })
})
