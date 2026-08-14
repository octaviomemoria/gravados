import { describe, it, expect } from 'vitest'
import { classifyDiskSpace } from '../../../src/renderer/features/recording/disk-space-thresholds'

describe('classifyDiskSpace', () => {
  it('returns "ok" when free space is comfortably above both thresholds', () => {
    expect(classifyDiskSpace(10 * 1024 * 1024 * 1024, 2048, 512)).toBe('ok')
  })

  it('returns "warning" once below the warning threshold but still above critical', () => {
    expect(classifyDiskSpace(1024 * 1024 * 1024, 2048, 512)).toBe('warning')
  })

  it('treats the warning threshold boundary as inclusive-safe (exactly at it is still "ok")', () => {
    expect(classifyDiskSpace(2048 * 1024 * 1024, 2048, 512)).toBe('ok')
    expect(classifyDiskSpace(2048 * 1024 * 1024 - 1, 2048, 512)).toBe('warning')
  })

  it('returns "critical" once below the critical threshold, even though also below warning', () => {
    expect(classifyDiskSpace(256 * 1024 * 1024, 2048, 512)).toBe('critical')
  })

  it('treats the critical threshold boundary as inclusive-safe (exactly at it is still "warning")', () => {
    expect(classifyDiskSpace(512 * 1024 * 1024, 2048, 512)).toBe('warning')
    expect(classifyDiskSpace(512 * 1024 * 1024 - 1, 2048, 512)).toBe('critical')
  })

  it('treats zero free bytes as critical', () => {
    expect(classifyDiskSpace(0, 2048, 512)).toBe('critical')
  })
})
