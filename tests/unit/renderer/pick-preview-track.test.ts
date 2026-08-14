import { describe, it, expect } from 'vitest'
import {
  pickPreviewTrack,
  isVideoTrackType
} from '../../../src/renderer/features/editor/pick-preview-track'
import type { TimelineTrack } from '../../../src/shared/schemas/editor.schema'

function track(type: TimelineTrack['type'], id = type): TimelineTrack {
  return { id, type, clips: [] }
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
