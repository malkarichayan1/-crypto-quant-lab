import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDeviceId } from './deviceId'

describe('getDeviceId', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('generates and persists an id on first call', () => {
    const id = getDeviceId()
    expect(id).toBeTruthy()
    expect(localStorage.getItem('hedgefund-device-id')).toBe(id)
  })

  it('returns the same id on subsequent calls', () => {
    const first = getDeviceId()
    const second = getDeviceId()
    expect(second).toBe(first)
  })

  it('reuses an id already in localStorage instead of generating a new one', () => {
    localStorage.setItem('hedgefund-device-id', 'existing-id')
    expect(getDeviceId()).toBe('existing-id')
  })
})
