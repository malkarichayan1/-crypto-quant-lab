import '@testing-library/jest-dom'

// Recharts uses ResizeObserver internally; jsdom does not provide it.
window.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
