import { describe, it, expect } from 'vitest'
import {
  guessMediaContentType,
  parseRangeHeader,
  isValidMediaRelativePath
} from '../../../src/main/media/media-protocol-utils'

describe('guessMediaContentType', () => {
  it('returns video/webm for screen and camera segments', () => {
    expect(guessMediaContentType('source/screen/screen_000001.webm')).toBe('video/webm')
    expect(guessMediaContentType('source/camera/camera_000001.webm')).toBe('video/webm')
  })

  it('returns audio/webm for microphone and system-audio segments', () => {
    expect(guessMediaContentType('source/microphone/microphone_000001.webm')).toBe('audio/webm')
    expect(guessMediaContentType('source/system-audio/system-audio_000001.webm')).toBe(
      'audio/webm'
    )
  })

  it('handles Windows backslash separators the same as forward slashes', () => {
    expect(guessMediaContentType('source\\camera\\camera_000001.webm')).toBe('video/webm')
  })

  it('falls back to audio/webm for anything without a recognized source subfolder', () => {
    expect(guessMediaContentType('manifest.json')).toBe('audio/webm')
  })
})

describe('parseRangeHeader', () => {
  const FILE_SIZE = 1000

  it('returns null when there is no Range header', () => {
    expect(parseRangeHeader(null, FILE_SIZE)).toBeNull()
  })

  it('parses a bounded range', () => {
    expect(parseRangeHeader('bytes=0-499', FILE_SIZE)).toEqual({ start: 0, end: 499 })
  })

  it('parses an open-ended range as up to the last byte of the file', () => {
    expect(parseRangeHeader('bytes=500-', FILE_SIZE)).toEqual({ start: 500, end: 999 })
  })

  it('accepts a single-byte range at the very end of the file', () => {
    expect(parseRangeHeader('bytes=999-999', FILE_SIZE)).toEqual({ start: 999, end: 999 })
  })

  it('rejects a malformed header', () => {
    expect(parseRangeHeader('not-a-range', FILE_SIZE)).toBeNull()
  })

  it('rejects a range that starts beyond the end of the file', () => {
    expect(parseRangeHeader('bytes=2000-3000', FILE_SIZE)).toBeNull()
  })

  it('rejects an inverted range (end before start)', () => {
    expect(parseRangeHeader('bytes=500-100', FILE_SIZE)).toBeNull()
  })
})

describe('isValidMediaRelativePath', () => {
  it('accepts the exact pattern produced by the recording pipeline', () => {
    expect(isValidMediaRelativePath('source/screen/screen_000001.webm')).toBe(true)
    expect(isValidMediaRelativePath('source/camera/camera_000002.webm')).toBe(true)
    expect(isValidMediaRelativePath('source/microphone/microphone_000001.webm')).toBe(true)
    expect(isValidMediaRelativePath('source/system-audio/system-audio_000001.webm')).toBe(true)
  })

  it('rejects directory traversal attempts', () => {
    expect(isValidMediaRelativePath('source/screen/../../../etc/passwd')).toBe(false)
    expect(isValidMediaRelativePath('../../../etc/passwd')).toBe(false)
  })

  it('rejects any other file in the project tree', () => {
    expect(isValidMediaRelativePath('manifest.json')).toBe(false)
    expect(isValidMediaRelativePath('recovery/something.json')).toBe(false)
  })

  it('rejects an unrecognized source subfolder', () => {
    expect(isValidMediaRelativePath('source/invalid-type/file.webm')).toBe(false)
  })

  it('rejects the wrong file extension', () => {
    expect(isValidMediaRelativePath('source/screen/screen_000001.mp4')).toBe(false)
  })
})
