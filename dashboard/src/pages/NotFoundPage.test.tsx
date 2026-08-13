import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotFoundPage } from './NotFoundPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  )
}

describe('NotFoundPage', () => {
  it('renders a heading, a link home, and a noindex robots meta tag', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  it('restores the previous robots meta content on unmount', () => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'index, follow'
    document.head.appendChild(meta)

    const { unmount } = renderPage()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')

    unmount()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index, follow',
    )
    meta.remove()
  })

  it('sets a distinct title and description', () => {
    renderPage()
    expect(document.title).toBe('Page not found — HedgeFund Simulator')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      "The page you're looking for doesn't exist or may have moved.",
    )
  })
})
