import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('merges conditional classes and resolves tailwind conflicts', () => {
    expect(cn('p-2', undefined, false, 'p-4')).toBe('p-4')
    expect(cn('text-sm', 'font-bold')).toBe('text-sm font-bold')
  })
})
