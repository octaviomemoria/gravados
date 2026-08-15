import { describe, it, expect } from 'vitest'
import {
  buildFfprobeArgs,
  parseFfmpegProgressLine,
  computeExportProgress,
  runFfmpegProcess
} from '../../../src/main/media/ffmpeg/ffmpeg-runner'
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

  it('EXP-002 - resolves to the real ffmpeg-static/ffprobe-static binaries when nothing overrides them', () => {
    // Sem override e sem MEETING_STUDIO_FFMPEG_PATH/_FFPROBE_PATH no ambiente de teste - deve
    // cair pros pacotes `-static` instalados neste incremento, nunca `null`.
    const result = resolveFfmpegBinaries()
    expect(result.ffmpegPath).toBeTruthy()
    expect(result.ffprobePath).toBeTruthy()
    expect(result.ffmpegPath).toContain('ffmpeg')
    expect(result.ffprobePath).toContain('ffprobe')
  })
})

describe('parseFfmpegProgressLine', () => {
  it('extracts out_time_us and converts to milliseconds', () => {
    expect(parseFfmpegProgressLine('out_time_us=2000000')).toBe(2000)
  })

  it('returns null for any other progress key (frame/fps/progress/etc.)', () => {
    expect(parseFfmpegProgressLine('frame=100')).toBeNull()
    expect(parseFfmpegProgressLine('fps=25.00')).toBeNull()
    expect(parseFfmpegProgressLine('progress=continue')).toBeNull()
    expect(parseFfmpegProgressLine('progress=end')).toBeNull()
    expect(parseFfmpegProgressLine('out_time=00:00:02.000000')).toBeNull()
  })

  it('returns null for a malformed or negative value (defensive)', () => {
    expect(parseFfmpegProgressLine('out_time_us=not-a-number')).toBeNull()
    expect(parseFfmpegProgressLine('out_time_us=-5')).toBeNull()
    expect(parseFfmpegProgressLine('')).toBeNull()
  })
})

describe('computeExportProgress', () => {
  it('computes a simple percentage', () => {
    expect(computeExportProgress(5000, 10_000)).toBe(50)
  })

  it('reaches exactly 100 at the end', () => {
    expect(computeExportProgress(10_000, 10_000)).toBe(100)
  })

  it('clamps above 100 (FFmpeg can report slightly past the real duration on the last chunk)', () => {
    expect(computeExportProgress(10_500, 10_000)).toBe(100)
  })

  it('returns 0 defensively when totalDurationMs is zero or negative', () => {
    expect(computeExportProgress(5000, 0)).toBe(0)
    expect(computeExportProgress(5000, -1)).toBe(0)
  })
})

describe('runFfmpegProcess', () => {
  it('resolves with exitCode 0 and canceled false for a process that exits normally', async () => {
    const handle = runFfmpegProcess({
      binaryPath: process.execPath,
      args: ['-e', 'process.exit(0)']
    })
    const result = await handle.result
    expect(result).toEqual({ exitCode: 0, stderr: '', canceled: false })
  })

  it('captures stderr output', async () => {
    const handle = runFfmpegProcess({
      binaryPath: process.execPath,
      args: ['-e', 'process.stderr.write("boom"); process.exit(1)']
    })
    const result = await handle.result
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('boom')
    expect(result.canceled).toBe(false)
  })

  it('parses out_time_us lines from stdout and reports progress via onProgress', async () => {
    const reported: number[] = []
    const handle = runFfmpegProcess({
      binaryPath: process.execPath,
      args: [
        '-e',
        'process.stdout.write("frame=1\\nout_time_us=2500000\\nprogress=continue\\n"); process.exit(0)'
      ],
      onProgress: (percent) => reported.push(percent),
      totalDurationMs: 5000
    })
    await handle.result
    expect(reported).toEqual([50])
  })

  it('cancel() kills a long-running process early and marks the result canceled', async () => {
    const handle = runFfmpegProcess({
      binaryPath: process.execPath,
      // Processo que ficaria vivo por 60s se nao fosse cancelado.
      args: ['-e', 'setTimeout(() => {}, 60_000)']
    })
    handle.cancel()
    const result = await handle.result
    expect(result.canceled).toBe(true)
    // Sinal de kill - exitCode normalmente null no Windows/POSIX quando morto por sinal, nunca 0.
    expect(result.exitCode).not.toBe(0)
  }, 15_000)

  it('cancel() is a safe no-op when called after the process already finished', async () => {
    const handle = runFfmpegProcess({
      binaryPath: process.execPath,
      args: ['-e', 'process.exit(0)']
    })
    const result = await handle.result
    expect(() => handle.cancel()).not.toThrow()
    expect(result.canceled).toBe(false)
  })
})
