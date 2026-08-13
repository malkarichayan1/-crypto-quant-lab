import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { FaqSection, FAQ_ITEMS } from './FaqSection'

function renderSection() {
  return render(
    <MemoryRouter>
      <FaqSection />
    </MemoryRouter>,
  )
}

describe('FaqSection', () => {
  it('renders exactly 5 collapsed questions', () => {
    renderSection()
    const section = screen.getByRole('heading', { name: /frequently asked questions/i }).closest(
      'section',
    )!
    expect(within(section).getAllByRole('button')).toHaveLength(5)
    expect(FAQ_ITEMS).toHaveLength(5)
  })

  it('reveals the answer when a question is clicked, and hides it again on a second click', async () => {
    const user = userEvent.setup()
    renderSection()
    const firstQuestion = screen.getByRole('button', { name: FAQ_ITEMS[0].question })
    expect(firstQuestion).toHaveAttribute('aria-expanded', 'false')
    // The panel stays mounted (so aria-controls always resolves) but should
    // not be visible while collapsed.
    expect(screen.getByText(FAQ_ITEMS[0].answer)).not.toBeVisible()

    await user.click(firstQuestion)
    expect(firstQuestion).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(FAQ_ITEMS[0].answer)).toBeVisible()

    await user.click(firstQuestion)
    expect(firstQuestion).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(FAQ_ITEMS[0].answer)).not.toBeVisible()
  })

  it('links the data-collection answer to the Privacy Policy page', async () => {
    const user = userEvent.setup()
    renderSection()
    const dataQuestion = screen.getByRole('button', { name: /what data do you collect/i })
    await user.click(dataQuestion)
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('emits FAQPage JSON-LD matching the rendered questions', () => {
    renderSection()
    const script = document.querySelector('script[data-json-ld-id="faq-schema"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.textContent ?? '{}')
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(5)
    expect(data.mainEntity[0].name).toBe(FAQ_ITEMS[0].question)
  })
})
