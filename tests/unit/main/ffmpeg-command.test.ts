import { describe, it, expect } from 'vitest'
import { buildFfmpegArgs } from '../../../src/main/media/ffmpeg-command'
import type { RenderPlan } from '../../../src/main/media/render-plan'

/**
 * EXP-003/004 (vigesimo quinto incremento - Fase 4, "FFmpeg Plan"). Testes ESTRUTURAIS puros -
 * confirmam a FORMA do array de argumentos gerado (inputs corretos, filter_complex bem formado,
 * -map/-c:v/-c:a corretos) sem spawnar FFmpeg de verdade (isso e o `export.service.test.ts`, que
 * roda um FFmpeg REAL contra midia sintetica pra provar que a sintaxe gerada aqui e genuinamente
 * valida, nao so estruturalmente plausivel).
 */

const PROJECT_ROOT = 'C:\\fake\\project-root'
const OUTPUT_PATH = 'C:\\fake\\project-root\\exports\\out.mp4'

function basePlan(overrides: Partial<RenderPlan> = {}): RenderPlan {
  return {
    editProjectId: 'edit-1',
    background: {
      trackId: 'screen',
      clips: [
        { relativePath: 'source/screen/screen_000001.webm', sourceStartMs: 0, durationMs: 5000, timelineStartMs: 0 }
      ]
    },
    sideBySideRight: null,
    overlay: null,
    audio: [],
    output: { width: 1280, height: 720, startMs: 0, endMs: 5000 },
    ...overrides
  }
}

describe('buildFfmpegArgs', () => {
  it('returns null when there is no background layer (audio-only, deferred to EXP-005)', () => {
    const args = buildFfmpegArgs(basePlan({ background: null }), PROJECT_ROOT, OUTPUT_PATH)
    expect(args).toBeNull()
  })

  it('returns null when the plan has an overlay (PiP deferred to a future increment)', () => {
    const plan = basePlan({
      overlay: {
        trackId: 'camera',
        clips: [{ relativePath: 'source/camera/x.webm', sourceStartMs: 0, durationMs: 5000, timelineStartMs: 0 }],
        xPercent: 70,
        yPercent: 70,
        widthPercent: 25,
        heightPercent: 25,
        shape: 'rectangle'
      }
    })
    expect(buildFfmpegArgs(plan, PROJECT_ROOT, OUTPUT_PATH)).toBeNull()
  })

  it('returns null when the plan has a sideBySideRight layer (side-by-side deferred)', () => {
    const plan = basePlan({
      sideBySideRight: {
        trackId: 'camera',
        clips: [{ relativePath: 'source/camera/x.webm', sourceStartMs: 0, durationMs: 5000, timelineStartMs: 0 }]
      }
    })
    expect(buildFfmpegArgs(plan, PROJECT_ROOT, OUTPUT_PATH)).toBeNull()
  })

  it('builds -y, one -i per unique input, and never a concatenated string (AGENTS.md)', () => {
    const args = buildFfmpegArgs(basePlan(), PROJECT_ROOT, OUTPUT_PATH)!
    expect(args[0]).toBe('-y')
    expect(args).toContain('-i')
    expect(args.every((arg) => typeof arg === 'string')).toBe(true)
    const inputIndex = args.indexOf('-i')
    expect(args[inputIndex + 1]).toContain('screen_000001.webm')
    expect(args[inputIndex + 1].startsWith(PROJECT_ROOT)).toBe(true)
  })

  it('maps [vfinal] with libx264/-pix_fmt yuv420p and -an when there is no audio track', () => {
    const args = buildFfmpegArgs(basePlan(), PROJECT_ROOT, OUTPUT_PATH)!
    expect(args).toEqual(
      expect.arrayContaining(['-map', '[vfinal]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an'])
    )
    expect(args).not.toContain('[afinal]')
  })

  it('scales/pads to the requested output resolution', () => {
    const args = buildFfmpegArgs(basePlan(), PROJECT_ROOT, OUTPUT_PATH)!
    const filterComplex = args[args.indexOf('-filter_complex') + 1]
    expect(filterComplex).toContain('scale=1280:720:force_original_aspect_ratio=decrease')
    expect(filterComplex).toContain('pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black')
  })

  it('concatenates multiple background clips (e.g. after a REMOVE_RANGE split) via the concat filter', () => {
    const plan = basePlan({
      background: {
        trackId: 'screen',
        clips: [
          { relativePath: 'source/screen/screen_000001.webm', sourceStartMs: 0, durationMs: 2000, timelineStartMs: 0 },
          { relativePath: 'source/screen/screen_000001.webm', sourceStartMs: 3000, durationMs: 2000, timelineStartMs: 2000 }
        ]
      }
    })
    const args = buildFfmpegArgs(plan, PROJECT_ROOT, OUTPUT_PATH)!
    const filterComplex = args[args.indexOf('-filter_complex') + 1]
    expect(filterComplex).toContain('concat=n=2:v=1:a=0')
    // Mesmo arquivo referenciado duas vezes - so UM -i (reuso de input), nao dois.
    expect(args.filter((arg) => arg === '-i')).toHaveLength(1)
  })

  it('applies volume + fade filters per audio track and mixes multiple tracks with amix', () => {
    const plan = basePlan({
      audio: [
        {
          trackId: 'mic',
          clips: [{ relativePath: 'source/microphone/mic_000001.webm', sourceStartMs: 0, durationMs: 5000, timelineStartMs: 0 }],
          volume: 0.5,
          fadeInMs: 500,
          fadeOutMs: 1000
        },
        {
          trackId: 'system-audio',
          clips: [{ relativePath: 'source/system-audio/sys_000001.webm', sourceStartMs: 0, durationMs: 5000, timelineStartMs: 0 }],
          volume: 1,
          fadeInMs: 0,
          fadeOutMs: 0
        }
      ]
    })
    const args = buildFfmpegArgs(plan, PROJECT_ROOT, OUTPUT_PATH)!
    const filterComplex = args[args.indexOf('-filter_complex') + 1]
    expect(filterComplex).toContain('volume=0.5000')
    expect(filterComplex).toContain('afade=t=in:st=0:d=0.500')
    expect(filterComplex).toContain('afade=t=out:st=4.000:d=1.000')
    expect(filterComplex).toContain('amix=inputs=2:duration=longest:normalize=0')
    expect(args).toEqual(expect.arrayContaining(['-map', '[afinal]', '-c:a', 'aac', '-b:a', '192k']))
  })

  it('does not emit amix for a single audio track (avoids an unnecessary filter stage)', () => {
    const plan = basePlan({
      audio: [
        {
          trackId: 'mic',
          clips: [{ relativePath: 'source/microphone/mic_000001.webm', sourceStartMs: 0, durationMs: 5000, timelineStartMs: 0 }],
          volume: 1,
          fadeInMs: 0,
          fadeOutMs: 0
        }
      ]
    })
    const args = buildFfmpegArgs(plan, PROJECT_ROOT, OUTPUT_PATH)!
    const filterComplex = args[args.indexOf('-filter_complex') + 1]
    expect(filterComplex).not.toContain('amix')
  })

  it('applies the output range (startMs/endMs) as a final trim on both video and audio', () => {
    const plan = basePlan({
      output: { width: 1280, height: 720, startMs: 1000, endMs: 4000 },
      audio: [
        {
          trackId: 'mic',
          clips: [{ relativePath: 'source/microphone/mic_000001.webm', sourceStartMs: 0, durationMs: 5000, timelineStartMs: 0 }],
          volume: 1,
          fadeInMs: 0,
          fadeOutMs: 0
        }
      ]
    })
    const args = buildFfmpegArgs(plan, PROJECT_ROOT, OUTPUT_PATH)!
    const filterComplex = args[args.indexOf('-filter_complex') + 1]
    expect(filterComplex).toContain('trim=start=1.000:end=4.000')
    expect(filterComplex).toContain('atrim=start=1.000:end=4.000')
  })

  it('rejects a relativePath that escapes the project root (defense in depth, project-filesystem.ts)', () => {
    const plan = basePlan({
      background: {
        trackId: 'screen',
        clips: [{ relativePath: '../../etc/passwd', sourceStartMs: 0, durationMs: 1000, timelineStartMs: 0 }]
      }
    })
    expect(() => buildFfmpegArgs(plan, PROJECT_ROOT, OUTPUT_PATH)).toThrow()
  })

  it('ends with -movflags +faststart, -progress pipe:1 and the output path as the last argument', () => {
    const args = buildFfmpegArgs(basePlan(), PROJECT_ROOT, OUTPUT_PATH)!
    expect(args).toEqual(expect.arrayContaining(['-movflags', '+faststart', '-progress', 'pipe:1']))
    expect(args[args.length - 1]).toBe(OUTPUT_PATH)
  })
})
