import { describe, it, expect } from 'vitest'
import { applyRemoveRange } from '../../../src/main/services/apply-remove-range'
import type { TimelineClip, TimelineTrack } from '../../../src/shared/schemas/editor.schema'

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    segmentId: 'segment-1',
    seqIndex: 1,
    relativePath: 'source/microphone/microphone_000001.webm',
    startMs: 0,
    endMs: 1000,
    sourceStartMs: 0,
    byteSize: 1000,
    ...overrides
  }
}

function track(clips: TimelineClip[], type: TimelineTrack['type'] = 'MICROPHONE'): TimelineTrack {
  return { id: 'track-1', type, clips, gainDb: 0, muted: false }
}

describe('applyRemoveRange', () => {
  it('leaves a clip entirely before the cut untouched', () => {
    const result = applyRemoveRange([track([clip({ startMs: 0, endMs: 500 })])], 1000, 2000)
    expect(result[0]!.clips).toEqual([clip({ startMs: 0, endMs: 500 })])
  })

  it('leaves a clip touching the exact start of the cut untouched (boundary case)', () => {
    const result = applyRemoveRange([track([clip({ startMs: 0, endMs: 1000 })])], 1000, 2000)
    expect(result[0]!.clips).toEqual([clip({ startMs: 0, endMs: 1000 })])
  })

  it('shifts a clip entirely after the cut left by the removed duration', () => {
    const result = applyRemoveRange([track([clip({ startMs: 3000, endMs: 4000 })])], 1000, 2000)
    expect(result[0]!.clips).toEqual([clip({ startMs: 2000, endMs: 3000 })])
  })

  it('shifts a clip starting exactly at the end of the cut (boundary case)', () => {
    const result = applyRemoveRange([track([clip({ startMs: 2000, endMs: 3000 })])], 1000, 2000)
    expect(result[0]!.clips).toEqual([clip({ startMs: 1000, endMs: 2000 })])
  })

  it('removes a clip entirely swallowed by the cut', () => {
    const result = applyRemoveRange([track([clip({ startMs: 1200, endMs: 1800 })])], 1000, 2000)
    expect(result[0]!.clips).toEqual([])
  })

  it('truncates a clip whose tail is cut, keeping the surviving head at its original position and source offset', () => {
    const result = applyRemoveRange([track([clip({ startMs: 500, endMs: 1500 })])], 1000, 2000)
    expect(result[0]!.clips).toEqual([
      clip({ startMs: 500, endMs: 1000, sourceStartMs: 0 })
    ])
  })

  it('truncates a clip whose head is cut, repositioning the surviving tail at the cut start and advancing its source offset', () => {
    const result = applyRemoveRange([track([clip({ startMs: 1500, endMs: 2500 })])], 1000, 2000)
    expect(result[0]!.clips).toEqual([
      // Sobra so a partir de 2000 (fim do corte) na origem, reposicionado em 1000 (inicio do
      // corte) na nova timeline - 500ms de conteudo original preservados.
      clip({ startMs: 1000, endMs: 1500, sourceStartMs: 500 })
    ])
  })

  it('splits a clip into two when the cut falls entirely inside it', () => {
    const result = applyRemoveRange(
      [track([clip({ startMs: 0, endMs: 2000, sourceStartMs: 0 })])],
      500,
      1000
    )
    expect(result[0]!.clips).toEqual([
      clip({ startMs: 0, endMs: 500, sourceStartMs: 0 }),
      // A partir de onde o corte TERMINOU na origem (1000), nao de onde comecou (500) - o
      // trecho [500,1000) foi descartado, entao o que sobra retoma exatamente depois dele.
      clip({ startMs: 500, endMs: 1500, sourceStartMs: 1000 })
    ])
  })

  it('applies the same global cut independently across multiple tracks with different layouts', () => {
    const tracks = [
      track([clip({ segmentId: 'mic', startMs: 0, endMs: 3000 })], 'MICROPHONE'),
      track(
        [
          clip({ segmentId: 'cam-1', startMs: 0, endMs: 800 }),
          clip({ segmentId: 'cam-2', startMs: 1500, endMs: 3000 })
        ],
        'CAMERA'
      )
    ]
    const result = applyRemoveRange(tracks, 700, 1700)
    // Trilha MICROFONE: um unico clip cobrindo os dois lados do corte se divide em dois.
    expect(result[0]!.clips).toEqual([
      clip({ segmentId: 'mic', startMs: 0, endMs: 700 }),
      clip({ segmentId: 'mic', startMs: 700, endMs: 2000, sourceStartMs: 1700 })
    ])
    // Trilha CAMERA: cam-1 perde a cauda (700-800), o gap 800-1500 desaparece do calculo (nao
    // existia clip ali pra sobreviver ou ser cortado), cam-2 perde a cabeca (1500-1700).
    expect(result[1]!.clips).toEqual([
      clip({ segmentId: 'cam-1', startMs: 0, endMs: 700 }),
      clip({ segmentId: 'cam-2', startMs: 700, endMs: 2000, sourceStartMs: 200 })
    ])
  })

  it('preserves seqIndex, relativePath, and byteSize through a split', () => {
    const result = applyRemoveRange(
      [track([clip({ seqIndex: 3, relativePath: 'source/camera/camera_000003.webm', byteSize: 9999, startMs: 0, endMs: 2000 })])],
      500,
      1000
    )
    for (const survivor of result[0]!.clips) {
      expect(survivor.seqIndex).toBe(3)
      expect(survivor.relativePath).toBe('source/camera/camera_000003.webm')
      expect(survivor.byteSize).toBe(9999)
    }
  })

  it('returns an empty clips array unchanged for a track with no clips', () => {
    const result = applyRemoveRange([track([])], 0, 1000)
    expect(result[0]!.clips).toEqual([])
  })
})
