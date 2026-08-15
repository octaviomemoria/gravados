import { describe, it, expect } from 'vitest'
import {
  buildFfprobeArgs,
  parseFfmpegProgressLine,
  computeExportProgress,
  runFfmpegProcess,
  runFfprobeProcess,
  validateFfprobeOutput
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

// EXP-009 - mesmo padrao ja usado acima pra `runFfmpegProcess` (spawns REAIS via `process.execPath`
// com scripts inline, sem mockar `child_process`) - `runFfprobeProcess` nunca escreve num arquivo
// de midia, entao nao precisa do binario ffprobe de verdade pra testar o wrapper de processo em
// si (spawn/stdout/stderr/exitCode); a integracao com o ffprobe REAL fica coberta em
// `export.service.test.ts` (que gera clipes sinteticos de verdade via `ffmpeg-static`).
describe('runFfprobeProcess', () => {
  it('captures stdout/stderr and resolves with the real exit code', async () => {
    const result = await runFfprobeProcess(process.execPath, [
      '-e',
      'process.stdout.write("out-chunk"); process.stderr.write("err-chunk"); process.exit(0)'
    ])
    expect(result).toEqual({ exitCode: 0, stdout: 'out-chunk', stderr: 'err-chunk' })
  })

  it('accumulates stdout across multiple chunks (not just the last one, unlike progress parsing)', async () => {
    const result = await runFfprobeProcess(process.execPath, [
      '-e',
      'process.stdout.write("{\\"a\\":1,"); process.stdout.write("\\"b\\":2}"); process.exit(0)'
    ])
    expect(result.stdout).toBe('{"a":1,"b":2}')
    expect(JSON.parse(result.stdout)).toEqual({ a: 1, b: 2 })
  })

  it('reports a non-zero exit code without throwing', async () => {
    const result = await runFfprobeProcess(process.execPath, ['-e', 'process.exit(1)'])
    expect(result.exitCode).toBe(1)
  })

  it('rejects when the binary itself cannot be spawned (path does not exist)', async () => {
    await expect(
      runFfprobeProcess('C:/this/binary/does/not/exist.exe', [])
    ).rejects.toThrow()
  })
})

describe('validateFfprobeOutput', () => {
  it('accepts a well-formed ffprobe JSON with at least one stream and a positive duration', () => {
    const stdout = JSON.stringify({
      format: { duration: '2.048000' },
      streams: [{ codec_type: 'video' }]
    })
    expect(validateFfprobeOutput(stdout)).toEqual({ valid: true, durationMs: 2048 })
  })

  it('rejects stdout that is not valid JSON (ffprobe never actually ran against the file)', () => {
    const result = validateFfprobeOutput('not json at all')
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/JSON/)
  })

  it('rejects JSON that is not an object (e.g. a bare array or primitive)', () => {
    expect(validateFfprobeOutput('[]').valid).toBe(false)
    expect(validateFfprobeOutput('42').valid).toBe(false)
    expect(validateFfprobeOutput('null').valid).toBe(false)
  })

  it('rejects a file with zero streams (technically well-formed container, zero usable content)', () => {
    const stdout = JSON.stringify({ format: { duration: '2.0' }, streams: [] })
    const result = validateFfprobeOutput(stdout)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/stream/)
  })

  it('rejects a file with a missing "streams" field entirely', () => {
    const stdout = JSON.stringify({ format: { duration: '2.0' } })
    expect(validateFfprobeOutput(stdout).valid).toBe(false)
  })

  it('rejects a file with zero, missing, or non-numeric duration', () => {
    const withoutDuration = JSON.stringify({ format: {}, streams: [{ codec_type: 'audio' }] })
    const zeroDuration = JSON.stringify({
      format: { duration: '0' },
      streams: [{ codec_type: 'audio' }]
    })
    const nonNumericDuration = JSON.stringify({
      format: { duration: 'N/A' },
      streams: [{ codec_type: 'audio' }]
    })
    expect(validateFfprobeOutput(withoutDuration).valid).toBe(false)
    expect(validateFfprobeOutput(zeroDuration).valid).toBe(false)
    expect(validateFfprobeOutput(nonNumericDuration).valid).toBe(false)
  })
})
