import { describe, it, expect } from 'vitest'
import { buildTranscriptionAudioExtractionArgs } from '../../../src/main/media/transcription-audio-extraction'

/**
 * Refinamento pos-SEARCH-001 (transcricao local). Testes ESTRUTURAIS puros - confirmam a FORMA do
 * array de argumentos gerado, sem spawnar FFmpeg de verdade (isso e o teste de integracao real em
 * `transcription.service.test.ts`, que roda FFmpeg contra um segmento MICROFONE sintetico real).
 */
const PROJECT_ROOT = 'C:\\fake\\project-root'
const OUTPUT_PATH = 'C:\\fake\\out.wav'

describe('buildTranscriptionAudioExtractionArgs', () => {
  it('returns null when no track has any segment', () => {
    const args = buildTranscriptionAudioExtractionArgs(
      [{ trackId: 't1', segments: [] }],
      PROJECT_ROOT,
      OUTPUT_PATH
    )
    expect(args).toBeNull()
  })

  it('returns null for an empty track list', () => {
    expect(buildTranscriptionAudioExtractionArgs([], PROJECT_ROOT, OUTPUT_PATH)).toBeNull()
  })

  it('builds a single-input pipeline for one track with one segment (no concat, no amix)', () => {
    const args = buildTranscriptionAudioExtractionArgs(
      [{ trackId: 't1', segments: [{ relativePath: 'source/microphone/microphone_000001.webm' }] }],
      PROJECT_ROOT,
      OUTPUT_PATH
    )
    expect(args).not.toBeNull()
    expect(args).toContain('-i')
    expect(args!.join(' ')).not.toContain('concat=')
    expect(args!.join(' ')).not.toContain('amix=')
    expect(args).toContain('-ar')
    expect(args![args!.indexOf('-ar') + 1]).toBe('16000')
    expect(args).toContain('-ac')
    expect(args![args!.indexOf('-ac') + 1]).toBe('1')
    expect(args).toContain('pcm_s16le')
    expect(args![args!.length - 1]).toBe(OUTPUT_PATH)
  })

  it('concatenates multiple segments of the SAME track (segmentation/rotation)', () => {
    const args = buildTranscriptionAudioExtractionArgs(
      [
        {
          trackId: 't1',
          segments: [
            { relativePath: 'source/microphone/microphone_000001.webm' },
            { relativePath: 'source/microphone/microphone_000002.webm' }
          ]
        }
      ],
      PROJECT_ROOT,
      OUTPUT_PATH
    )
    expect(args).not.toBeNull()
    const filterComplex = args![args!.indexOf('-filter_complex') + 1]!
    expect(filterComplex).toContain('concat=n=2:v=0:a=1')
    expect(filterComplex).not.toContain('amix=')
  })

  it('mixes multiple DIFFERENT tracks via amix (e.g. MICROPHONE + SYSTEM_AUDIO)', () => {
    const args = buildTranscriptionAudioExtractionArgs(
      [
        { trackId: 'mic', segments: [{ relativePath: 'source/microphone/microphone_000001.webm' }] },
        { trackId: 'sys', segments: [{ relativePath: 'source/system_audio/system_audio_000001.webm' }] }
      ],
      PROJECT_ROOT,
      OUTPUT_PATH
    )
    expect(args).not.toBeNull()
    const filterComplex = args![args!.indexOf('-filter_complex') + 1]!
    expect(filterComplex).toContain('amix=inputs=2')
  })

  it('skips a track with zero segments but still uses the other track(s)', () => {
    const args = buildTranscriptionAudioExtractionArgs(
      [
        { trackId: 'empty', segments: [] },
        { trackId: 'mic', segments: [{ relativePath: 'source/microphone/microphone_000001.webm' }] }
      ],
      PROJECT_ROOT,
      OUTPUT_PATH
    )
    expect(args).not.toBeNull()
    expect(args!.join(' ')).not.toContain('amix=')
  })

  it('deduplicates the same input path referenced twice (defensive, mirrors buildFfmpegArgs)', () => {
    const args = buildTranscriptionAudioExtractionArgs(
      [
        { trackId: 't1', segments: [{ relativePath: 'source/microphone/microphone_000001.webm' }] },
        { trackId: 't2', segments: [{ relativePath: 'source/microphone/microphone_000001.webm' }] }
      ],
      PROJECT_ROOT,
      OUTPUT_PATH
    )
    const inputCount = args!.filter((arg) => arg === '-i').length
    expect(inputCount).toBe(1)
  })

  it('throws PermissionDeniedError for a relativePath escaping the project root (directory traversal)', () => {
    expect(() =>
      buildTranscriptionAudioExtractionArgs(
        [{ trackId: 't1', segments: [{ relativePath: '../../etc/passwd' }] }],
        PROJECT_ROOT,
        OUTPUT_PATH
      )
    ).toThrow()
  })
})
