import { describe, it, expect } from 'vitest'
import { dbToLinearVolume } from '../../../src/shared/media/audio-gain'

describe('dbToLinearVolume', () => {
  it('maps 0dB to full volume (no change)', () => {
    expect(dbToLinearVolume(0)).toBe(1)
  })

  it('maps -60dB to near-silent, not exactly 0', () => {
    const volume = dbToLinearVolume(-60)
    expect(volume).toBeGreaterThan(0)
    expect(volume).toBeCloseTo(0.001, 3)
  })

  it('maps -6dB to roughly half amplitude', () => {
    expect(dbToLinearVolume(-6)).toBeCloseTo(0.501, 2)
  })

  it('clamps a positive gainDb (out of schema range, defensive) to at most 1', () => {
    expect(dbToLinearVolume(12)).toBe(1)
  })

  it('clamps a gainDb far below -60 (defensive) to at least 0', () => {
    expect(dbToLinearVolume(-1000)).toBeGreaterThanOrEqual(0)
  })
})
