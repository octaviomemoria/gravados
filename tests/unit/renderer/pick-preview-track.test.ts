import { describe, it, expect } from 'vitest'
import {
  pickPreviewTrack,
  isVideoTrackType,
  pickOverlayCameraTrack
} from '../../../src/renderer/features/editor/pick-preview-track'
import type { TimelineTrack, CameraTransform } from '../../../src/shared/schemas/editor.schema'

const DEFAULT_TRANSFORM: CameraTransform = {
  visible: true,
  xPercent: 70,
  yPercent: 70,
  widthPercent: 25,
  heightPercent: 25,
  shape: 'rectangle'
}

function track(
  type: TimelineTrack['type'],
  id = type,
  cameraTransform: CameraTransform | null = type === 'CAMERA' ? DEFAULT_TRANSFORM : null
): TimelineTrack {
  return { id, type, clips: [], gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0, cameraTransform }
}

describe('pickPreviewTrack', () => {
  it('prioritizes screen over every other track type', () => {
    const tracks = [track('MICROPHONE'), track('CAMERA'), track('SCREEN'), track('SYSTEM_AUDIO')]
    expect(pickPreviewTrack(tracks)?.type).toBe('SCREEN')
  })

  it('prioritizes camera when there is no screen track', () => {
    const tracks = [track('MICROPHONE'), track('CAMERA'), track('SYSTEM_AUDIO')]
    expect(pickPreviewTrack(tracks)?.type).toBe('CAMERA')
  })

  it('falls back to the first available track when there is no video track', () => {
    const tracks = [track('MICROPHONE'), track('SYSTEM_AUDIO')]
    expect(pickPreviewTrack(tracks)?.type).toBe('MICROPHONE')
  })

  it('returns null when there are no tracks at all', () => {
    expect(pickPreviewTrack([])).toBeNull()
  })
})

describe('isVideoTrackType', () => {
  it('treats screen and camera as video', () => {
    expect(isVideoTrackType('SCREEN')).toBe(true)
    expect(isVideoTrackType('CAMERA')).toBe(true)
  })

  it('treats microphone and system audio as non-video', () => {
    expect(isVideoTrackType('MICROPHONE')).toBe(false)
    expect(isVideoTrackType('SYSTEM_AUDIO')).toBe(false)
  })
})

describe('pickOverlayCameraTrack', () => {
  it('returns the camera track when the background is a different track (e.g. screen)', () => {
    const screen = track('SCREEN')
    const camera = track('CAMERA')
    expect(pickOverlayCameraTrack([screen, camera], screen.id)).toBe(camera)
  })

  it('returns null when the camera IS the background track (camera-only recording)', () => {
    const camera = track('CAMERA')
    expect(pickOverlayCameraTrack([camera], camera.id)).toBeNull()
  })

  it('returns null when there is no camera track at all', () => {
    const screen = track('SCREEN')
    const mic = track('MICROPHONE')
    expect(pickOverlayCameraTrack([screen, mic], screen.id)).toBeNull()
  })

  it('returns null when cameraTransform.visible is explicitly false', () => {
    const screen = track('SCREEN')
    const camera = track('CAMERA', 'CAMERA', { ...DEFAULT_TRANSFORM, visible: false })
    expect(pickOverlayCameraTrack([screen, camera], screen.id)).toBeNull()
  })

  it('returns the camera track when cameraTransform is null (defensive - should not normally happen for CAMERA)', () => {
    const screen = track('SCREEN')
    const camera = track('CAMERA', 'CAMERA', null)
    expect(pickOverlayCameraTrack([screen, camera], screen.id)).toBe(camera)
  })
})
