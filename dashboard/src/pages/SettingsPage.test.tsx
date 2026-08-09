import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { SettingsPage } from './SettingsPage'

describe('SettingsPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders a heading', () => {
    render(<SettingsPage />)

    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument()
  })

  it('shows the advisor toggle switched on by default', () => {
    render(<SettingsPage />)

    expect(screen.getByRole('switch', { name: /ai advisor/i })).toBeChecked()
  })

  it('turns the advisor off when toggled', async () => {
    render(<SettingsPage />)

    await userEvent.click(screen.getByRole('switch', { name: /ai advisor/i }))

    expect(screen.getByRole('switch', { name: /ai advisor/i })).not.toBeChecked()
  })

  it('persists the preference to localStorage', async () => {
    render(<SettingsPage />)

    await userEvent.click(screen.getByRole('switch', { name: /ai advisor/i }))

    expect(window.localStorage.getItem('hedgefund.advisorEnabled')).toBe('false')
  })

  it('reads a previously saved preference on mount', () => {
    window.localStorage.setItem('hedgefund.advisorEnabled', 'false')

    render(<SettingsPage />)

    expect(screen.getByRole('switch', { name: /ai advisor/i })).not.toBeChecked()
  })
})
