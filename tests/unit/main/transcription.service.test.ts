import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../fixtures/tmp-db'
import {
  ProjectRepository,
  TrackRepository,
  SegmentRepository,
  TranscriptionJobRepository,
  TranscriptRepository
} from '../../../src/main/database/repositories'
import { TranscriptionService, buildTranscriptEntities } from '../../../src/main/services/transcription.service'
import { JobRunner } from '../../../src/main/jobs/job-runner'
import { TranscriptionJobStore } from '../../../src/main/jobs/transcription-job-store'
import { initializeProjectOnDisk } from '../../../src/main/media/project-filesystem'
import { runFfmpegProcess } from '../../../src/main/media/ffmpeg/ffmpeg-runner'
import { resolveFfmpegBinaries } from '../../../src/main/media/ffmpeg/ffmpeg-locator'
import { NotFoundError, ValidationError } from '../../../src/shared/types/domain-errors'
import type { DatabaseClient } from '../../../src/main/database/client'
import type { ProjectEntity, TrackType } from '../../../src/shared/types/entities'
import type {
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResult
} from '../../../src/main/services/transcription/transcription-provider'

/** Provedor falso injetavel - devolve um resultado OU lanca um erro fixo, sem tocar rede nem
 * carregar nenhum modelo real (o mesmo espirito de `ffmpegBinaryOverrides` em
 * `export.service.test.ts`: isola a peca CARA/externa de testar, mantendo o resto do pipeline -
 * extracao de audio REAL via ffmpeg, enfileiramento, persistencia - genuino). */
class FakeTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'WHISPER_LOCAL' as const
  public lastRequest: TranscriptionRequest | undefined

  constructor(private readonly resultOrError: TranscriptionResult | Error) {}

  async transcribe(
    request: TranscriptionRequest,
    onProgress: (percent: number) => void
  ): Promise<TranscriptionResult> {
    this.lastRequest = request
    onProgress(50)
    if (this.resultOrError instanceof Error) throw this.resultOrError
    onProgress(100)
    return this.resultOrError
  }
}

const FAKE_RESULT: TranscriptionResult = {
  model: 'fake-model',
  language: 'pt',
  segments: [
    { startMs: 0, endMs: 1000, text: 'ola mundo' },
    { startMs: 1000, endMs: 2000, text: 'segunda frase' }
  ]
}

/**
 * Refinamento pos-SEARCH-001 - `WHISPER_LOCAL` agora transcreve DE VERDADE (extracao de audio real
 * via ffmpeg + `TranscriptionProvider` injetado, nunca mais um handler que sempre lanca como em
 * AI-001). `FakeTranscriptionProvider` isola so a chamada de inferencia (rede/modelo real, fora do
 * escopo de um teste automatizado - ver decisao registrada no README); a extracao de audio
 * (`buildTranscriptionAudioExtractionArgs` + `runFfmpegToCompletion`) roda com um segmento
 * MICROFONE sintetico real gerado via `ffmpeg-static` (lavfi `sine`), a mesma tecnica ja usada em
 * `export.service.test.ts`.
 */
describe('TranscriptionService', () => {
  let client: DatabaseClient
  let projectRepository: ProjectRepository
  let trackRepository: TrackRepository
  let segmentRepository: SegmentRepository
  let transcriptionJobRepository: TranscriptionJobRepository
  let transcriptRepository: TranscriptRepository
  let libraryRoot: string

  beforeEach(async () => {
    client = createTestDatabase()
    libraryRoot = await mkdtemp(join(tmpdir(), 'meeting-studio-transcription-test-'))
    projectRepository = new ProjectRepository(client.db)
    trackRepository = new TrackRepository(client.db)
    segmentRepository = new SegmentRepository(client.db)
    transcriptionJobRepository = new TranscriptionJobRepository(client.db)
    transcriptRepository = new TranscriptRepository(client.db)
  })

  afterEach(async () => {
    client.close()
    await rm(libraryRoot, { recursive: true, force: true })
  })

  function buildService(provider: TranscriptionProvider): TranscriptionService {
    const transcriptionJobRunner = new JobRunner(new TranscriptionJobStore(transcriptionJobRepository))
    return new TranscriptionService(
      projectRepository,
      trackRepository,
      segmentRepository,
      transcriptionJobRunner,
      transcriptionJobRepository,
      transcriptRepository,
      provider
    )
  }

  function createProject(status: ProjectEntity['status'] = 'COMPLETED', rootPath = libraryRoot): { id: string } {
    const id = randomUUID()
    projectRepository.create({
      id,
      title: 'Reuniao gravada',
      createdAt: new Date().toISOString(),
      status,
      rootPath
    })
    return { id }
  }

  function addTrack(projectId: string, type: TrackType): void {
    trackRepository.create({
      id: randomUUID(),
      projectId,
      type,
      enabled: true,
      position: 0,
      startOffsetMs: 0
    })
  }

  /** Cria um projeto real em disco com UM segmento MICROFONE de verdade (2s, tom sintetico via
   * `ffmpeg-static`) - a unica forma de exercitar a extracao de audio real de ponta a ponta, mesma
   * tecnica de `setupScreenAndMicProject` em `export.service.test.ts`. */
  async function createProjectWithRealMicSegment(): Promise<{ id: string }> {
    const { ffmpegPath } = resolveFfmpegBinaries()
    expect(ffmpegPath).toBeTruthy()

    const projectId = randomUUID()
    const { paths } = await initializeProjectOnDisk(libraryRoot, projectId)

    const micClipPath = join(paths.sourceMicrophonePath, 'microphone_000001.webm')
    const generateMic = runFfmpegProcess({
      binaryPath: ffmpegPath!,
      args: ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-vn', '-c:a', 'libopus', micClipPath]
    })
    expect((await generateMic.result).exitCode).toBe(0)

    projectRepository.create({
      id: projectId,
      title: 'Reuniao com audio real',
      createdAt: new Date().toISOString(),
      status: 'COMPLETED',
      rootPath: paths.rootPath
    })
    const trackId = randomUUID()
    trackRepository.create({
      id: trackId,
      projectId,
      type: 'MICROPHONE',
      enabled: true,
      position: 0,
      startOffsetMs: 0
    })
    segmentRepository.create({
      id: randomUUID(),
      trackId,
      seqIndex: 1,
      relativePath: 'source/microphone/microphone_000001.webm',
      startedAtMs: 0,
      endedAtMs: 2000,
      durationMs: 2000,
      byteSize: 1,
      mimeType: 'audio/webm',
      finalized: true
    })
    return { id: projectId }
  }

  async function waitForTerminalJob(jobId: string) {
    const deadline = Date.now() + 15_000
    let job = transcriptionJobRepository.findById(jobId)!
    while (Date.now() < deadline && (job.status === 'QUEUED' || job.status === 'RUNNING')) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20))
      job = transcriptionJobRepository.findById(jobId)!
    }
    return job
  }

  describe('startTranscription - validacao', () => {
    it('throws NotFoundError for an unknown project', () => {
      const service = buildService(new FakeTranscriptionProvider(FAKE_RESULT))
      expect(() => service.startTranscription('missing-project')).toThrow(NotFoundError)
    })

    it('throws ValidationError when the project is not COMPLETED', () => {
      const service = buildService(new FakeTranscriptionProvider(FAKE_RESULT))
      const project = createProject('RECORDING')
      expect(() => service.startTranscription(project.id)).toThrow(ValidationError)
    })

    it('throws ValidationError when the project has no audio-capable track (SCREEN/CAMERA only)', () => {
      const service = buildService(new FakeTranscriptionProvider(FAKE_RESULT))
      const project = createProject()
      addTrack(project.id, 'SCREEN')
      addTrack(project.id, 'CAMERA')
      expect(() => service.startTranscription(project.id)).toThrow(ValidationError)
    })

    it('accepts a project with a MICROPHONE track and a project with a SYSTEM_AUDIO track', () => {
      const service = buildService(new FakeTranscriptionProvider(FAKE_RESULT))
      const micProject = createProject()
      addTrack(micProject.id, 'MICROPHONE')
      expect(() => service.startTranscription(micProject.id)).not.toThrow()

      const sysAudioProject = createProject()
      addTrack(sysAudioProject.id, 'SYSTEM_AUDIO')
      expect(() => service.startTranscription(sysAudioProject.id)).not.toThrow()
    })
  })

  describe('startTranscription - pipeline real (extracao de audio + provedor injetado)', () => {
    it(
      'extracts real audio, calls the provider, and persists the transcript on success (job ends COMPLETED)',
      async () => {
        const provider = new FakeTranscriptionProvider(FAKE_RESULT)
        const service = buildService(provider)
        const project = await createProjectWithRealMicSegment()

        const job = service.startTranscription(project.id, 'pt')
        expect(['QUEUED', 'RUNNING']).toContain(job.status)
        expect(job.provider).toBe('WHISPER_LOCAL')

        const finalJob = await waitForTerminalJob(job.id)
        expect(finalJob.status).toBe('COMPLETED')
        expect(finalJob.completedAt).toBeTruthy()
        expect(finalJob.progress).toBe(100)

        // O provedor recebeu um caminho de audio de verdade (o WAV extraido pelo ffmpeg), nao um
        // placeholder - confirma que a extracao rodou antes da chamada ao provedor.
        expect(provider.lastRequest?.audioPath).toMatch(/\.wav$/)
        expect(provider.lastRequest?.language).toBe('pt')

        const transcript = service.getTranscript(project.id)
        expect(transcript).not.toBeNull()
        expect(transcript!.provider).toBe('WHISPER_LOCAL')
        expect(transcript!.model).toBe('fake-model')
        expect(transcript!.segments).toHaveLength(2)
        expect(transcript!.segments[0]!.text).toBe('ola mundo')
      },
      20_000
    )

    it(
      'ends the job FAILED with the provider error message when transcription itself fails',
      async () => {
        const service = buildService(new FakeTranscriptionProvider(new Error('modelo indisponivel')))
        const project = await createProjectWithRealMicSegment()

        const job = service.startTranscription(project.id)
        const finalJob = await waitForTerminalJob(job.id)
        expect(finalJob.status).toBe('FAILED')
        expect(finalJob.error).toContain('modelo indisponivel')
        expect(service.getTranscript(project.id)).toBeNull()
      },
      20_000
    )

    it(
      'ends the job FAILED when audio extraction itself fails (broken ffmpeg path)',
      async () => {
        const transcriptionJobRunner = new JobRunner(new TranscriptionJobStore(transcriptionJobRepository))
        const service = new TranscriptionService(
          projectRepository,
          trackRepository,
          segmentRepository,
          transcriptionJobRunner,
          transcriptionJobRepository,
          transcriptRepository,
          new FakeTranscriptionProvider(FAKE_RESULT),
          { ffmpegPath: join(libraryRoot, 'nao-existe-ffmpeg.exe') }
        )
        const project = await createProjectWithRealMicSegment()

        const job = service.startTranscription(project.id)
        const finalJob = await waitForTerminalJob(job.id)
        expect(finalJob.status).toBe('FAILED')
        expect(service.getTranscript(project.id)).toBeNull()
      },
      20_000
    )
  })

  describe('getStatus / listJobs', () => {
    it('throws NotFoundError for an unknown job id', () => {
      const service = buildService(new FakeTranscriptionProvider(FAKE_RESULT))
      expect(() => service.getStatus('missing-job')).toThrow(NotFoundError)
    })

    it('listJobs returns every job created for a project, most recent first', async () => {
      const service = buildService(new FakeTranscriptionProvider(FAKE_RESULT))
      const project = await createProjectWithRealMicSegment()
      const first = service.startTranscription(project.id)
      await waitForTerminalJob(first.id)
      const second = service.startTranscription(project.id)
      await waitForTerminalJob(second.id)

      const jobs = service.listJobs(project.id)
      expect(jobs).toHaveLength(2)
      expect(jobs[0]!.id).toBe(second.id)
      expect(jobs[1]!.id).toBe(first.id)
    })
  })

  describe('getTranscript', () => {
    it('returns null when the project never had a completed transcript', () => {
      const service = buildService(new FakeTranscriptionProvider(FAKE_RESULT))
      const project = createProject()
      expect(service.getTranscript(project.id)).toBeNull()
    })

    it('returns the most recent transcript with its segments ordered by startMs', () => {
      const service = buildService(new FakeTranscriptionProvider(FAKE_RESULT))
      const project = createProject()

      const older = buildTranscriptEntities(project.id, 'WHISPER_LOCAL', {
        model: 'whisper-base',
        language: 'pt',
        segments: [{ startMs: 0, endMs: 1000, text: 'primeiro' }]
      })
      transcriptRepository.createWithSegments(older.transcript, older.segments)

      // `createdAt` precisa ser estritamente maior pra `getTranscript` escolher este como o mais
      // recente (o campo e uma string ISO comparada lexicograficamente).
      const newer = buildTranscriptEntities(project.id, 'WHISPER_LOCAL', {
        model: 'whisper-base',
        language: 'en',
        segments: [
          { startMs: 2000, endMs: 3000, text: 'segundo', speaker: 'A', confidence: 0.9 },
          { startMs: 0, endMs: 2000, text: 'zero', speaker: 'B' }
        ]
      })
      newer.transcript.createdAt = new Date(Date.now() + 1000).toISOString()
      transcriptRepository.createWithSegments(newer.transcript, newer.segments)

      const result = service.getTranscript(project.id)
      expect(result).not.toBeNull()
      expect(result!.id).toBe(newer.transcript.id)
      expect(result!.language).toBe('en')
      // Ordenado por startMs, nao pela ordem de insercao (o segmento "zero" foi inserido DEPOIS
      // do "segundo" no array, mas comeca antes na timeline).
      expect(result!.segments.map((segment) => segment.text)).toEqual(['zero', 'segundo'])
      expect(result!.segments[0]!.speaker).toBe('B')
      expect(result!.segments[1]!.confidence).toBe(0.9)
    })
  })
})

describe('buildTranscriptEntities', () => {
  it('generates a fresh id for the transcript and one per segment, mapping optional fields to null', () => {
    const { transcript, segments } = buildTranscriptEntities('project-1', 'WHISPER_LOCAL', {
      model: 'whisper-base',
      language: null,
      segments: [{ startMs: 0, endMs: 500, text: 'ola' }]
    })
    expect(transcript.projectId).toBe('project-1')
    expect(transcript.provider).toBe('WHISPER_LOCAL')
    expect(transcript.model).toBe('whisper-base')
    expect(transcript.language).toBeNull()
    expect(transcript.id).toBeTruthy()
    expect(segments).toHaveLength(1)
    expect(segments[0]!.transcriptId).toBe(transcript.id)
    expect(segments[0]!.speaker).toBeNull()
    expect(segments[0]!.confidence).toBeNull()
    expect(segments[0]!.id).toBeTruthy()
  })

  it('preserves speaker/confidence when provided by the caller', () => {
    const { segments } = buildTranscriptEntities('project-1', 'WHISPER_LOCAL', {
      model: 'whisper-base',
      language: 'en',
      segments: [{ startMs: 0, endMs: 500, text: 'hi', speaker: 'Speaker 1', confidence: 0.87 }]
    })
    expect(segments[0]!.speaker).toBe('Speaker 1')
    expect(segments[0]!.confidence).toBe(0.87)
  })

  it('produces distinct ids across two calls, even with identical input', () => {
    const input = { model: 'whisper-base', language: null, segments: [] }
    const first = buildTranscriptEntities('project-1', 'WHISPER_LOCAL', input)
    const second = buildTranscriptEntities('project-1', 'WHISPER_LOCAL', input)
    expect(first.transcript.id).not.toBe(second.transcript.id)
  })
})
