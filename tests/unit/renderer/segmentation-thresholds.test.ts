import { describe, it, expect } from 'vitest'
import { shouldRotateForSize } from '../../../src/renderer/features/recording/segmentation-thresholds'

describe('shouldRotateForSize', () => {
  it('never rotates when there is no size limit configured (null)', () => {
    expect(shouldRotateForSize(0, null)).toBe(false)
    expect(shouldRotateForSize(999_999_999, null)).toBe(false)
  })

  it('does not rotate while below the configured limit', () => {
    expect(shouldRotateForSize(1024, 1)).toBe(false)
  })

  it('rotates exactly at the configured limit (MB converted to bytes)', () => {
    expect(shouldRotateForSize(1 * 1024 * 1024, 1)).toBe(true)
  })

  it('rotates once past the configured limit', () => {
    expect(shouldRotateForSize(2 * 1024 * 1024, 1)).toBe(true)
  })
})
