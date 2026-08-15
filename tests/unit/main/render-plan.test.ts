import { describe, it, expect } from 'vitest'
import { buildRenderPlan } from '../../../src/main/media/render-plan'
import type {
  GetEditedTimelineResponse,
  TimelineTrack,
  TimelineClip,
  CameraTransform
} from '../../../src/shared/schemas/editor.schema'

const DEFAULT_TRANSFORM: CameraTransform = {
  visible: true,
  xPercent: 70,
  yPercent: 70,
  widthPercent: 25,
  heightPercent: 25,
  shape: 'rectangle'
}

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    segmentId: 'segment-1',
    seqIndex: 1,
    relativePath: 'source/microphone/microphone_000001.webm',
    startMs: 0,
    endMs: 5000,
    sourceStartMs: 0,
    byteSize: 1000,
    ...overrides
  }
}

function track(overrides: Partial<TimelineTrack> & { type: TimelineTrack['type'] }): TimelineTrack {
  return {
    id: overrides.type,
    clips: [clip({ relativePath: `source/${overrides.type.toLowerCase()}/x.webm` })],
    gainDb: 0,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    cameraTransform: overrides.type === 'CAMERA' ? DEFAULT_TRANSFORM : null,
    ...overrides
  }
}

function timeline(
  tracks: TimelineTrack[],
  overrides: Partial<GetEditedTimelineResponse> = {}
): GetEditedTimelineResponse {
  return {
    editProjectId: 'edit-project-1',
    projectId: 'project-1',
    totalDurationMs: 5000,
    tracks,
    canUndo: false,
    canRedo: false,
    layoutPreset: 'PIP',
    ...overrides
  }
}

describe('buildRenderPlan', () => {
  it('PIP with screen+camera: background is screen, overlay carries cameraTransform', () => {
    const screen = track({ type: 'SCREEN' })
    const camera = track({ type: 'CAMERA' })
    const plan = buildRenderPlan(timeline([screen, camera]), { resolution: 'HD_720P' })

    expect(plan.background?.trackId).toBe('SCREEN')
    expect(plan.overlay?.trackId).toBe('CAMERA')
    expect(plan.overlay).toMatchObject({
      xPercent: 70,
      yPercent: 70,
      widthPercent: 25,
      heightPercent: 25,
      shape: 'rectangle'
    })
    expect(plan.sideBySideRight).toBeNull()
  })

  it('CAMERA_ONLY with only a camera track: single background, no overlay', () => {
    const camera = track({ type: 'CAMERA' })
    const plan = buildRenderPlan(timeline([camera], { layoutPreset: 'CAMERA_ONLY' }), {
      resolution: 'HD_720P'
    })

    expect(plan.background?.trackId).toBe('CAMERA')
    expect(plan.overlay).toBeNull()
    expect(plan.sideBySideRight).toBeNull()
  })

  it('SIDE_BY_SIDE with screen+camera: background is the LEFT pane, sideBySideRight is the RIGHT pane', () => {
    const screen = track({ type: 'SCREEN' })
    const camera = track({ type: 'CAMERA' })
    const plan = buildRenderPlan(timeline([screen, camera], { layoutPreset: 'SIDE_BY_SIDE' }), {
      resolution: 'HD_720P'
    })

    expect(plan.background?.trackId).toBe('SCREEN')
    expect(plan.sideBySideRight?.trackId).toBe('CAMERA')
    expect(plan.overlay).toBeNull()
  })

  it('audio-only recording (no video track): background/overlay/sideBySideRight all null', () => {
    const mic = track({ type: 'MICROPHONE' })
    const plan = buildRenderPlan(timeline([mic]), { resolution: 'HD_720P' })

    expect(plan.background).toBeNull()
    expect(plan.overlay).toBeNull()
    expect(plan.sideBySideRight).toBeNull()
    expect(plan.audio).toHaveLength(1)
  })

  it('resolves gainDb to linear volume and carries fade values through, per audio track', () => {
    const mic = track({ type: 'MICROPHONE', gainDb: -6, fadeInMs: 1000, fadeOutMs: 2000 })
    const plan = buildRenderPlan(timeline([mic]), { resolution: 'HD_720P' })

    expect(plan.audio).toHaveLength(1)
    expect(plan.audio[0]!.trackId).toBe('MICROPHONE')
    expect(plan.audio[0]!.volume).toBeCloseTo(0.501, 2)
    expect(plan.audio[0]!.fadeInMs).toBe(1000)
    expect(plan.audio[0]!.fadeOutMs).toBe(2000)
  })

  it('a MUTED track is entirely excluded from the audio mix (not volume 0)', () => {
    const mic = track({ type: 'MICROPHONE', muted: true })
    const systemAudio = track({ type: 'SYSTEM_AUDIO' })
    const plan = buildRenderPlan(timeline([mic, systemAudio]), { resolution: 'HD_720P' })

    expect(plan.audio).toHaveLength(1)
    expect(plan.audio[0]!.trackId).toBe('SYSTEM_AUDIO')
  })

  it('converts clips to render clips preserving sourceStartMs/duration/timeline position', () => {
    const mic = track({
      type: 'MICROPHONE',
      clips: [
        clip({ startMs: 1000, endMs: 3000, sourceStartMs: 500, relativePath: 'source/microphone/x.webm' })
      ]
    })
    const plan = buildRenderPlan(timeline([mic]), { resolution: 'HD_720P' })

    expect(plan.audio[0]!.clips).toEqual([
      {
        relativePath: 'source/microphone/x.webm',
        sourceStartMs: 500,
        durationMs: 2000,
        timelineStartMs: 1000
      }
    ])
  })

  it('HD_720P resolves to 1280x720', () => {
    const mic = track({ type: 'MICROPHONE' })
    const plan = buildRenderPlan(timeline([mic]), { resolution: 'HD_720P' })
    expect(plan.output).toMatchObject({ width: 1280, height: 720 })
  })

  it('FULL_HD_1080P resolves to 1920x1080', () => {
    const mic = track({ type: 'MICROPHONE' })
    const plan = buildRenderPlan(timeline([mic]), { resolution: 'FULL_HD_1080P' })
    expect(plan.output).toMatchObject({ width: 1920, height: 1080 })
  })

  it('output range defaults to the whole timeline when rangeMs is omitted', () => {
    const mic = track({ type: 'MICROPHONE' })
    const plan = buildRenderPlan(timeline([mic], { totalDurationMs: 12_345 }), {
      resolution: 'HD_720P'
    })
    expect(plan.output.startMs).toBe(0)
    expect(plan.output.endMs).toBe(12_345)
  })

  it('EXP-006 - honors an explicit rangeMs for a partial export', () => {
    const mic = track({ type: 'MICROPHONE' })
    const plan = buildRenderPlan(timeline([mic], { totalDurationMs: 10_000 }), {
      resolution: 'HD_720P',
      rangeMs: { startMs: 2000, endMs: 8000 }
    })
    expect(plan.output.startMs).toBe(2000)
    expect(plan.output.endMs).toBe(8000)
  })

  it('carries editProjectId through from the source timeline', () => {
    const mic = track({ type: 'MICROPHONE' })
    const plan = buildRenderPlan(timeline([mic], { editProjectId: 'my-edit-project' }), {
      resolution: 'HD_720P'
    })
    expect(plan.editProjectId).toBe('my-edit-project')
  })

  it('respects cameraTransform.visible=false: no overlay even in PIP mode', () => {
    const screen = track({ type: 'SCREEN' })
    const camera = track({ type: 'CAMERA', cameraTransform: { ...DEFAULT_TRANSFORM, visible: false } })
    const plan = buildRenderPlan(timeline([screen, camera]), { resolution: 'HD_720P' })

    expect(plan.background?.trackId).toBe('SCREEN')
    expect(plan.overlay).toBeNull()
  })
})
