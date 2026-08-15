import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../fixtures/tmp-db'
import {
  ProjectRepository,
  TrackRepository,
  TranscriptionJobRepository,
  TranscriptRepository
} from '../../../src/main/database/repositories'
import { TranscriptionService, buildTranscriptEntities } from '../../../src/main/services/transcription.service'
import { JobRunner } from '../../../src/main/jobs/job-runner'
import { TranscriptionJobStore } from '../../../src/main/jobs/transcription-job-store'
import { NotFoundError, ValidationError } from '../../../src/shared/types/domain-errors'
import type { DatabaseClient } from '../../../src/main/database/client'
import type { ProjectEntity, TrackType } from '../../../src/shared/types/entities'

/**
 * AI-001 (trigesimo segundo incremento - Fase 5 "Transcrição"). Repositorios/JobRunner reais
 * (mesmo padrao ja usado em `export.service.test.ts`), sem nenhum spawn de processo - nao ha
 * FFmpeg nem chamada de rede nesta fase, so validacao + enfileiramento + a garantia de que o job
 * sempre termina `FAILED` de forma limpa (nenhum `TranscriptionProvider` real existe ainda).
 */
describe('TranscriptionService', () => {
  let client: DatabaseClient
  let projectRepository: ProjectRepository
  let trackRepository: TrackRepository
  let transcriptionJobRepository: TranscriptionJobRepository
  let transcriptRepository: TranscriptRepository
  let transcriptionService: TranscriptionService

  beforeEach(() => {
    client = createTestDatabase()
    projectRepository = new ProjectRepository(client.db)
    trackRepository = new TrackRepository(client.db)
    transcriptionJobRepository = new TranscriptionJobRepository(client.db)
    transcriptRepository = new TranscriptRepository(client.db)
    const transcriptionJobRunner = new JobRunner(new TranscriptionJobStore(transcriptionJobRepository))
    transcriptionService = new TranscriptionService(
      projectRepository,
      trackRepository,
      transcriptionJobRunner,
      transcriptionJobRepository,
      transcriptRepository
    )
  })

  afterEach(() => {
    client.close()
  })

  function createProject(status: ProjectEntity['status'] = 'COMPLETED'): { id: string } {
    const id = randomUUID()
    projectRepository.create({
      id,
      title: 'Reuniao gravada',
      createdAt: new Date().toISOString(),
      status,
      rootPath: `C:\\fake\\${id}`
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

  async function waitForTerminalJob(jobId: string) {
    const deadline = Date.now() + 5000
    let job = transcriptionJobRepository.findById(jobId)!
    while (Date.now() < deadline && (job.status === 'QUEUED' || job.status === 'RUNNING')) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20))
      job = transcriptionJobRepository.findById(jobId)!
    }
    return job
  }

  describe('startTranscription - validacao', () => {
    it('throws NotFoundError for an unknown project', () => {
      expect(() => transcriptionService.startTranscription('missing-project')).toThrow(NotFoundError)
    })

    it('throws ValidationError when the project is not COMPLETED', () => {
      const project = createProject('RECORDING')
      expect(() => transcriptionService.startTranscription(project.id)).toThrow(ValidationError)
    })

    it('throws ValidationError when the project has no audio-capable track (SCREEN/CAMERA only)', () => {
      const project = createProject()
      addTrack(project.id, 'SCREEN')
      addTrack(project.id, 'CAMERA')
      expect(() => transcriptionService.startTranscription(project.id)).toThrow(ValidationError)
    })

    it('accepts a project with a MICROPHONE track and a project with a SYSTEM_AUDIO track', () => {
      const micProject = createProject()
      addTrack(micProject.id, 'MICROPHONE')
      expect(() => transcriptionService.startTranscription(micProject.id)).not.toThrow()

      const sysAudioProject = createProject()
      addTrack(sysAudioProject.id, 'SYSTEM_AUDIO')
      expect(() => transcriptionService.startTranscription(sysAudioProject.id)).not.toThrow()
    })
  })

  describe('startTranscription - enfileiramento real', () => {
    it(
      'enqueues successfully and the job always ends FAILED with a clear "no provider" message (AI-001 scope)',
      async () => {
        const project = createProject()
        addTrack(project.id, 'MICROPHONE')

        const job = transcriptionService.startTranscription(project.id)
        expect(['QUEUED', 'RUNNING']).toContain(job.status)
        expect(job.provider).toBe('OPENAI')
        expect(job.language).toBeNull()

        const finalJob = await waitForTerminalJob(job.id)
        expect(finalJob.status).toBe('FAILED')
        expect(finalJob.error).toContain('Nenhum provedor de transcricao configurado')
        expect(finalJob.completedAt).toBeTruthy()

        // Nenhum transcript e criado quando o job falha - so o `TranscriptionService` grava via
        // `transcriptRepository.createWithSegments`, e isso nunca roda neste caminho.
        expect(transcriptionService.getTranscript(project.id)).toBeNull()
      },
      10_000
    )

    it('passes the requested language through to the enqueued job payload', async () => {
      const project = createProject()
      addTrack(project.id, 'MICROPHONE')
      const job = transcriptionService.startTranscription(project.id, 'pt')
      expect(job.language).toBe('pt')
      await waitForTerminalJob(job.id)
    })
  })

  describe('getStatus / listJobs', () => {
    it('throws NotFoundError for an unknown job id', () => {
      expect(() => transcriptionService.getStatus('missing-job')).toThrow(NotFoundError)
    })

    it('listJobs returns every job created for a project, most recent first', async () => {
      const project = createProject()
      addTrack(project.id, 'MICROPHONE')
      const first = transcriptionService.startTranscription(project.id)
      await waitForTerminalJob(first.id)
      const second = transcriptionService.startTranscription(project.id)
      await waitForTerminalJob(second.id)

      const jobs = transcriptionService.listJobs(project.id)
      expect(jobs).toHaveLength(2)
      expect(jobs[0]!.id).toBe(second.id)
      expect(jobs[1]!.id).toBe(first.id)
    })
  })

  describe('getTranscript', () => {
    it('returns null when the project never had a completed transcript', () => {
      const project = createProject()
      expect(transcriptionService.getTranscript(project.id)).toBeNull()
    })

    it('returns the most recent transcript with its segments ordered by startMs', () => {
      const project = createProject()

      const older = buildTranscriptEntities(project.id, 'OPENAI', {
        model: 'whisper-1',
        language: 'pt',
        segments: [{ startMs: 0, endMs: 1000, text: 'primeiro' }]
      })
      transcriptRepository.createWithSegments(older.transcript, older.segments)

      // `createdAt` precisa ser estritamente maior pra `getTranscript` escolher este como o mais
      // recente (o campo e uma string ISO comparada lexicograficamente).
      const newer = buildTranscriptEntities(project.id, 'OPENAI', {
        model: 'whisper-1',
        language: 'en',
        segments: [
          { startMs: 2000, endMs: 3000, text: 'segundo', speaker: 'A', confidence: 0.9 },
          { startMs: 0, endMs: 2000, text: 'zero', speaker: 'B' }
        ]
      })
      newer.transcript.createdAt = new Date(Date.now() + 1000).toISOString()
      transcriptRepository.createWithSegments(newer.transcript, newer.segments)

      const result = transcriptionService.getTranscript(project.id)
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
    const { transcript, segments } = buildTranscriptEntities('project-1', 'OPENAI', {
      model: 'whisper-1',
      language: null,
      segments: [{ startMs: 0, endMs: 500, text: 'ola' }]
    })
    expect(transcript.projectId).toBe('project-1')
    expect(transcript.provider).toBe('OPENAI')
    expect(transcript.model).toBe('whisper-1')
    expect(transcript.language).toBeNull()
    expect(transcript.id).toBeTruthy()
    expect(segments).toHaveLength(1)
    expect(segments[0]!.transcriptId).toBe(transcript.id)
    expect(segments[0]!.speaker).toBeNull()
    expect(segments[0]!.confidence).toBeNull()
    expect(segments[0]!.id).toBeTruthy()
  })

  it('preserves speaker/confidence when provided by the caller', () => {
    const { segments } = buildTranscriptEntities('project-1', 'OPENAI', {
      model: 'whisper-1',
      language: 'en',
      segments: [{ startMs: 0, endMs: 500, text: 'hi', speaker: 'Speaker 1', confidence: 0.87 }]
    })
    expect(segments[0]!.speaker).toBe('Speaker 1')
    expect(segments[0]!.confidence).toBe(0.87)
  })

  it('produces distinct ids across two calls, even with identical input', () => {
    const input = { model: 'whisper-1', language: null, segments: [] }
    const first = buildTranscriptEntities('project-1', 'OPENAI', input)
    const second = buildTranscriptEntities('project-1', 'OPENAI', input)
    expect(first.transcript.id).not.toBe(second.transcript.id)
  })
})
