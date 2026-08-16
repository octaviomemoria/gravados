import { describe, it, expect, afterEach } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  WhisperLocalProvider,
  readWavPcm16Mono,
  mapWhisperChunksToSegments,
  type WhisperTranscribeFn
} from '../../../src/main/services/transcription/providers/whisper-local-provider'

/**
 * Refinamento pos-SEARCH-001 (transcricao local). O download/carregamento de um modelo Whisper
 * REAL fica FORA do escopo automatizado (dependencia de rede - categoria de flakiness nova, nunca
 * antes presente neste projeto, ver decisao registrada no README) - `pipelineFactory` injetavel
 * substitui a chamada real a `@huggingface/transformers` por uma funcao fake em TODOS os testes
 * abaixo. O parser de WAV (`readWavPcm16Mono`) e o mapeamento de chunks
 * (`mapWhisperChunksToSegments`) sao funcoes puras, testadas isoladamente com arquivos/dados
 * fabricados.
 */

const tempFiles: string[] = []
afterEach(async () => {
  await Promise.all(tempFiles.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

/** Monta um WAV PCM16 minimo a partir de amostras Int16 - o mesmo formato que
 * `buildTranscriptionAudioExtractionArgs` sempre produz (`pcm_s16le`), escrito a mao aqui pra nao
 * depender de nenhuma biblioteca externa de WAV nos testes. */
async function writeTestWav(sampleRate: number, samples: number[], numChannels = 1): Promise<string> {
  const dataLength = samples.length * 2
  const buffer = Buffer.alloc(44 + dataLength)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * numChannels * 2, 28) // byte rate
  buffer.writeUInt16LE(numChannels * 2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataLength, 40)
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2))

  const dir = await mkdtemp(join(tmpdir(), 'meeting-studio-wav-test-'))
  const filePath = join(dir, 'test.wav')
  await writeFile(filePath, buffer)
  tempFiles.push(dir)
  return filePath
}

describe('readWavPcm16Mono', () => {
  it('reads sample rate and decodes Int16 samples to the [-1, 1] float range', async () => {
    const filePath = await writeTestWav(16000, [0, 16384, -16384, 32767, -32768])
    const { sampleRate, samples } = readWavPcm16Mono(filePath)
    expect(sampleRate).toBe(16000)
    expect(samples).toHaveLength(5)
    expect(samples[0]).toBeCloseTo(0)
    expect(samples[1]).toBeCloseTo(0.5, 3)
    expect(samples[2]).toBeCloseTo(-0.5, 3)
    expect(samples[4]).toBeCloseTo(-1, 3)
  })

  it('downmixes a stereo WAV to mono by averaging channels', async () => {
    // Frame 1: esquerdo=32767 (~1.0), direito=-32768 (~-1.0) -> media ~0.
    const filePath = await writeTestWav(16000, [32767, -32768], 2)
    const { samples } = readWavPcm16Mono(filePath)
    expect(samples).toHaveLength(1)
    expect(samples[0]).toBeCloseTo(0, 2)
  })

  it('throws a clear error for a non-WAV file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meeting-studio-wav-test-'))
    const filePath = join(dir, 'not-a-wav.txt')
    await writeFile(filePath, 'nao sou um wav')
    tempFiles.push(dir)
    expect(() => readWavPcm16Mono(filePath)).toThrow(/RIFF\/WAVE/)
  })
})

describe('mapWhisperChunksToSegments', () => {
  it('maps timestamp seconds to startMs/endMs integers', () => {
    const segments = mapWhisperChunksToSegments(
      [{ timestamp: [0, 1.5], text: 'ola' }],
      2000
    )
    expect(segments).toEqual([{ startMs: 0, endMs: 1500, text: 'ola' }])
  })

  it('falls back to totalDurationMs when the last chunk has a null end timestamp', () => {
    const segments = mapWhisperChunksToSegments(
      [{ timestamp: [1, null], text: 'ultima palavra cortada' }],
      3200
    )
    expect(segments).toEqual([{ startMs: 1000, endMs: 3200, text: 'ultima palavra cortada' }])
  })

  it('discards chunks with empty/whitespace-only text', () => {
    const segments = mapWhisperChunksToSegments(
      [
        { timestamp: [0, 1], text: '  ' },
        { timestamp: [1, 2], text: 'real' }
      ],
      2000
    )
    expect(segments).toHaveLength(1)
    expect(segments[0]!.text).toBe('real')
  })

  it('trims surrounding whitespace from segment text', () => {
    const segments = mapWhisperChunksToSegments([{ timestamp: [0, 1], text: '  ola mundo  ' }], 1000)
    expect(segments[0]!.text).toBe('ola mundo')
  })
})

describe('WhisperLocalProvider', () => {
  it('reports coarse progress and returns the mapped result from the injected pipeline', async () => {
    const fakeTranscribe: WhisperTranscribeFn = async (_samples, _options) => ({
      text: 'ola mundo',
      chunks: [{ timestamp: [0, 1], text: 'ola mundo' }]
    })
    let factoryCallCount = 0
    const provider = new WhisperLocalProvider(
      () => 'base',
      async (repoId) => {
        factoryCallCount++
        expect(repoId).toBe('Xenova/whisper-base')
        return fakeTranscribe
      }
    )

    const filePath = await writeTestWav(16000, new Array(16000).fill(0)) // 1s de silencio
    const progressUpdates: number[] = []
    const result = await provider.transcribe({ audioPath: filePath, language: 'pt' }, (percent) =>
      progressUpdates.push(percent)
    )

    expect(result.model).toBe('Xenova/whisper-base')
    expect(result.language).toBe('pt')
    expect(result.segments).toEqual([{ startMs: 0, endMs: 1000, text: 'ola mundo' }])
    expect(progressUpdates[0]).toBeLessThan(progressUpdates[progressUpdates.length - 1]!)
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100)
    expect(factoryCallCount).toBe(1)
  })

  it('caches the pipeline across two calls with the same model (loads the model only once)', async () => {
    let factoryCallCount = 0
    const provider = new WhisperLocalProvider(
      () => 'base',
      async () => {
        factoryCallCount++
        return async () => ({ text: '', chunks: [] })
      }
    )
    const filePath = await writeTestWav(16000, [0, 0, 0, 0])
    await provider.transcribe({ audioPath: filePath }, () => {})
    await provider.transcribe({ audioPath: filePath }, () => {})
    expect(factoryCallCount).toBe(1)
  })

  it('resolves language to null when the caller does not request one', async () => {
    const provider = new WhisperLocalProvider(
      () => 'small',
      async () => async () => ({ text: '', chunks: [] })
    )
    const filePath = await writeTestWav(16000, [0, 0])
    const result = await provider.transcribe({ audioPath: filePath }, () => {})
    expect(result.language).toBeNull()
    expect(result.model).toBe('Xenova/whisper-small')
  })

  it('propagates an error thrown by the injected pipeline (never swallows it)', async () => {
    const provider = new WhisperLocalProvider(
      () => 'medium',
      async () => {
        throw new Error('falha ao baixar o modelo')
      }
    )
    const filePath = await writeTestWav(16000, [0, 0])
    await expect(provider.transcribe({ audioPath: filePath }, () => {})).rejects.toThrow(
      'falha ao baixar o modelo'
    )
  })
})
