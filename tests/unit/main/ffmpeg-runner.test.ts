import { describe, it, expect } from 'vitest'
import { buildFfprobeArgs } from '../../../src/main/media/ffmpeg/ffmpeg-runner'
import { resolveFfmpegBinaries } from '../../../src/main/media/ffmpeg/ffmpeg-locator'

describe('buildFfprobeArgs', () => {
  it('builds a fully-arrayed argument list, never a concatenated string (AGENTS.md)', () => {
    const args = buildFfprobeArgs('C:/videos/some file.mp4')
    expect(args).toEqual([
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      'C:/videos/some file.mp4'
    ])
    expect(args.every((arg) => typeof arg === 'string')).toBe(true)
  })
})

describe('resolveFfmpegBinaries', () => {
  it('honors explicit overrides', () => {
    const result = resolveFfmpegBinaries({ ffmpegPath: '/bin/ffmpeg', ffprobePath: '/bin/ffprobe' })
    expect(result).toEqual({ ffmpegPath: '/bin/ffmpeg', ffprobePath: '/bin/ffprobe' })
  })
})
