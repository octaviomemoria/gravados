import { describe, it, expect } from 'vitest'
import {
  findClipAtTime,
  clipLocalTimeSeconds,
  isDrifting,
  msFromPointerOffset,
  DRIFT_THRESHOLD_SECONDS
} from '../../../src/renderer/features/editor/timeline-playback'
import type { TimelineClip } from '../../../src/shared/schemas/editor.schema'

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    segmentId: 'segment-1',
    seqIndex: 1,
    relativePath: 'source/camera/camera_000001.webm',
    startMs: 0,
    endMs: 1000,
    byteSize: 1000,
    ...overrides
  }
}

describe('findClipAtTime', () => {
  it('returns the clip covering the given instant', () => {
    const clips = [clip({ segmentId: 'a', startMs: 0, endMs: 1000 }), clip({ segmentId: 'b', startMs: 1000, endMs: 2000 })]
    expect(findClipAtTime(clips, 500)?.segmentId).toBe('a')
    expect(findClipAtTime(clips, 1500)?.segmentId).toBe('b')
  })

  it('includes both boundary instants shared by adjacent clips', () => {
    const clips = [clip({ segmentId: 'a', startMs: 0, endMs: 1000 }), clip({ segmentId: 'b', startMs: 1000, endMs: 2000 })]
    // No instante exato da fronteira, o primeiro clip que casa (o que esta terminando) vence -
    // resultado deterministico, nao importa qual dos dois, contanto que sempre o mesmo.
    expect(findClipAtTime(clips, 1000)?.segmentId).toBe('a')
  })

  it('clamps to the first clip when the instant is before it starts (e.g. instant 0 before a track opens its first segment a few ms late)', () => {
    const clips = [clip({ segmentId: 'a', startMs: 1000, endMs: 2000 }), clip({ segmentId: 'b', startMs: 3000, endMs: 4000 })]
    expect(findClipAtTime(clips, 500)?.segmentId).toBe('a')
    expect(findClipAtTime(clips, 0)?.segmentId).toBe('a')
  })

  it('returns null after the last clip or inside a real gap between two clips', () => {
    const clips = [clip({ segmentId: 'a', startMs: 1000, endMs: 2000 }), clip({ segmentId: 'b', startMs: 3000, endMs: 4000 })]
    expect(findClipAtTime(clips, 2500)).toBeNull()
    expect(findClipAtTime(clips, 4500)).toBeNull()
  })

  it('returns null for a track with no clips at all', () => {
    expect(findClipAtTime([], 0)).toBeNull()
  })
})

describe('clipLocalTimeSeconds', () => {
  it('converts a global instant into the local offset within the clip', () => {
    const c = clip({ startMs: 1000, endMs: 3000 })
    expect(clipLocalTimeSeconds(c, 1500)).toBe(0.5)
  })

  it('clamps to 0 when the global instant is before the clip start', () => {
    const c = clip({ startMs: 1000, endMs: 3000 })
    expect(clipLocalTimeSeconds(c, 200)).toBe(0)
  })

  it('clamps to the clip duration when the global instant is past its end', () => {
    const c = clip({ startMs: 1000, endMs: 3000 })
    expect(clipLocalTimeSeconds(c, 10_000)).toBe(2)
  })
})

describe('isDrifting', () => {
  it('is false within the default threshold', () => {
    expect(isDrifting(1.1, 1.0)).toBe(false)
  })

  it('is true beyond the default threshold', () => {
    expect(isDrifting(1.5, 1.0)).toBe(true)
  })

  it('respects a custom threshold', () => {
    expect(isDrifting(1.1, 1.0, 0.05)).toBe(true)
  })

  it('the exported default threshold matches what isDrifting uses implicitly', () => {
    expect(isDrifting(1 + DRIFT_THRESHOLD_SECONDS + 0.01, 1)).toBe(true)
    expect(isDrifting(1 + DRIFT_THRESHOLD_SECONDS - 0.01, 1)).toBe(false)
  })
})

describe('msFromPointerOffset', () => {
  it('maps the middle of the element to the middle of the duration', () => {
    expect(msFromPointerOffset(50, 100, 10_000)).toBe(5000)
  })

  it('clamps negative offsets to 0', () => {
    expect(msFromPointerOffset(-20, 100, 10_000)).toBe(0)
  })

  it('clamps offsets past the element width to the total duration', () => {
    expect(msFromPointerOffset(500, 100, 10_000)).toBe(10_000)
  })

  it('returns 0 for a zero-width element instead of dividing by zero', () => {
    expect(msFromPointerOffset(10, 0, 10_000)).toBe(0)
  })
})
