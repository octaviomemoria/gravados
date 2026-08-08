import { describe, it, expect } from 'vitest'
import { calculateAudioLevel } from '../../../src/renderer/features/recording/audio-level'

describe('calculateAudioLevel', () => {
  it('returns 0 for silence (all samples at the 128 midpoint)', () => {
    const silence = new Uint8Array(64).fill(128)
    expect(calculateAudioLevel(silence)).toBe(0)
  })

  it('returns a value close to 1 for a full-amplitude square wave', () => {
    const loud = new Uint8Array(64)
    for (let i = 0; i < loud.length; i++) {
      loud[i] = i % 2 === 0 ? 0 : 255
    }
    expect(calculateAudioLevel(loud)).toBeCloseTo(1, 1)
  })

  it('never exceeds 1', () => {
    const extreme = new Uint8Array(64).fill(255)
    expect(calculateAudioLevel(extreme)).toBeLessThanOrEqual(1)
  })

  it('returns 0 for an empty buffer', () => {
    expect(calculateAudioLevel(new Uint8Array(0))).toBe(0)
  })
})
