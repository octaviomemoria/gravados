import { describe, it, expect } from 'vitest'
import { formatElapsed } from '../../../src/renderer/features/recording/format-elapsed'

describe('formatElapsed', () => {
  it('formats zero as 00:00:00', () => {
    expect(formatElapsed(0)).toBe('00:00:00')
  })

  it('formats seconds and minutes', () => {
    expect(formatElapsed(65_000)).toBe('00:01:05')
  })

  it('formats hours', () => {
    expect(formatElapsed(3_661_000)).toBe('01:01:01')
  })

  it('never returns negative values', () => {
    expect(formatElapsed(-500)).toBe('00:00:00')
  })
})
