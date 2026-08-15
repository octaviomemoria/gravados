import { describe, it, expect } from 'vitest'
import {
  findClipAtTime,
  clipLocalTimeSeconds,
  isDrifting,
  msFromPointerOffset,
  DRIFT_THRESHOLD_SECONDS,
  dbToLinearVolume,
  fadeVolumeMultiplier
} from '../../../src/renderer/features/editor/timeline-playback'
import type { TimelineClip } from '../../../src/shared/schemas/editor.schema'

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    segmentId: 'segment-1',
    seqIndex: 1,
    relativePath: 'source/camera/camera_000001.webm',
    sourceStartMs: 0,
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

  it('adds sourceStartMs when the clip was trimmed at the head by a REMOVE_RANGE (EDIT-004/005/006)', () => {
    const c = clip({ startMs: 1000, endMs: 3000, sourceStartMs: 500 })
    expect(clipLocalTimeSeconds(c, 1500)).toBe(1)
    expect(clipLocalTimeSeconds(c, 1000)).toBe(0.5)
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

describe('fadeVolumeMultiplier', () => {
  it('returns 1 (no attenuation) when both fadeInMs and fadeOutMs are 0', () => {
    expect(fadeVolumeMultiplier(5000, 0, 10_000, 0, 0)).toBe(1)
  })

  it('is silent at the exact start of the track when fading in', () => {
    expect(fadeVolumeMultiplier(1000, 1000, 10_000, 2000, 0)).toBe(0)
  })

  it('ramps up linearly during the fade-in window', () => {
    expect(fadeVolumeMultiplier(2000, 1000, 10_000, 2000, 0)).toBeCloseTo(0.5, 5)
  })

  it('reaches full volume exactly at the end of the fade-in window', () => {
    expect(fadeVolumeMultiplier(3000, 1000, 10_000, 2000, 0)).toBe(1)
  })

  it('stays at full volume well past the fade-in window', () => {
    expect(fadeVolumeMultiplier(9000, 1000, 10_000, 2000, 0)).toBe(1)
  })

  it('is silent at the exact end of the track when fading out', () => {
    expect(fadeVolumeMultiplier(10_000, 1000, 10_000, 0, 2000)).toBe(0)
  })

  it('ramps down linearly during the fade-out window', () => {
    expect(fadeVolumeMultiplier(9000, 1000, 10_000, 0, 2000)).toBeCloseTo(0.5, 5)
  })

  it('stays at full volume before the fade-out window starts', () => {
    expect(fadeVolumeMultiplier(5000, 1000, 10_000, 0, 2000)).toBe(1)
  })

  it('combines fade-in and fade-out via the minimum, never exceeding 1', () => {
    // Track duration 10s, 2s fade-in, 2s fade-out - well into the middle, both fades inactive.
    expect(fadeVolumeMultiplier(5000, 0, 10_000, 2000, 2000)).toBe(1)
  })

  it('on a track shorter than fadeIn+fadeOut, the smaller (more silent) multiplier always wins', () => {
    // Track spans 0..3000ms, fadeIn=2000ms, fadeOut=2000ms - windows overlap in the middle.
    // At 1500ms: fade-in progress = 1500/2000 = 0.75; fade-out remaining = 1500/2000 = 0.75.
    expect(fadeVolumeMultiplier(1500, 0, 3000, 2000, 2000)).toBeCloseTo(0.75, 5)
    // Never exceeds 1 even right at a boundary.
    expect(fadeVolumeMultiplier(0, 0, 3000, 2000, 2000)).toBe(0)
  })

  it('returns 1 for a degenerate track (endMs <= startMs), never NaN/divide-by-zero', () => {
    expect(fadeVolumeMultiplier(500, 1000, 1000, 2000, 2000)).toBe(1)
    expect(fadeVolumeMultiplier(500, 1000, 500, 2000, 2000)).toBe(1)
  })
})
