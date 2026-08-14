import { describe, it, expect } from 'vitest'
import {
  MEETING_MEDIA_SCHEME,
  buildMeetingMediaUrl
} from '../../../src/shared/constants/media-protocol'

describe('buildMeetingMediaUrl', () => {
  it('builds a URL under the meeting-media scheme with the project id as host', () => {
    const url = buildMeetingMediaUrl('project-1', 'source/microphone/microphone_000001.webm')
    expect(url).toBe(`${MEETING_MEDIA_SCHEME}://project-1/source/microphone/microphone_000001.webm`)
  })

  it('normalizes Windows backslash separators to forward slashes', () => {
    const url = buildMeetingMediaUrl('project-1', 'source\\camera\\camera_000001.webm')
    expect(url).toBe(`${MEETING_MEDIA_SCHEME}://project-1/source/camera/camera_000001.webm`)
  })

  it('percent-encodes each path segment without escaping the separating slashes', () => {
    const url = buildMeetingMediaUrl('project-1', 'source/camera/câmera 000001.webm')
    expect(url).toBe(
      `${MEETING_MEDIA_SCHEME}://project-1/source/camera/${encodeURIComponent('câmera 000001.webm')}`
    )
  })

  it('drops empty segments from stray double separators', () => {
    const url = buildMeetingMediaUrl('project-1', 'source//camera/camera_000001.webm')
    expect(url).toBe(`${MEETING_MEDIA_SCHEME}://project-1/source/camera/camera_000001.webm`)
  })
})
