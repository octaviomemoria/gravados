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
  MarkerRepository
} from '../../../src/main/database/repositories'
import { RecordingStateMachine } from '../../../src/main/recording/recording-state-machine'
import { RecordingSessionManager } from '../../../src/main/recording/recording-session-manager'
import { RecoveryService } from '../../../src/main/services/recovery.service'
import { buildProjectPaths, readManifest } from '../../../src/main/media/project-filesystem'
import type { DatabaseClient } from '../../../src/main/database/client'
import type { RecordingTrackHandle } from '../../../src/shared/schemas/recording.schema'

/**
 * RECOV-002/RECOV-003 (decimo incremento - Fase 2, recuperacao). `RecordingSessionManager` e
 * `RecoveryService` compartilham o mesmo banco/`libraryRoot` de teste, reproduzindo um crash real:
 * inicia (e opcionalmente escreve chunks) mas NUNCA chama `stop()` - o projeto fica preso em
 * `RECORDING` com dados reais em disco, exatamente como aconteceria se o processo morresse no
 * meio de uma sessao.
 */
describe('RecoveryService', () => {
  let client: DatabaseClient
  let libraryRoot: string
  let manager: RecordingSessionManager
  let recovery: RecoveryService
  let projectRepository: ProjectRepository
  let trackRepository: TrackRepository
  let segmentRepository: SegmentRepository

  beforeEach(async () => {
    client = createTestDatabase()
    libraryRoot = await mkdtemp(join(tmpdir(), 'meeting-studio-recovery-test-'))
    projectRepository = new ProjectRepository(client.db)
    trackRepository = new TrackRepository(client.db)
    segmentRepository = new SegmentRepository(client.db)
    const markerRepository = new MarkerRepository(client.db)
    manager = new RecordingSessionManager(
      projectRepository,
      trackRepository,
      segmentRepository,
      markerRepository,
      new RecordingStateMachine(),
      libraryRoot
    )
    recovery = new RecoveryService(projectRepository, trackRepository, segmentRepository, libraryRoot)
  })

  afterEach(async () => {
    client.close()
    await rm(libraryRoot, { recursive: true, force: true })
  })

  function createProject(): { id: string } {
    const id = randomUUID()
    projectRepository.create({
      id,
      title: 'Reuniao de teste',
      createdAt: new Date().toISOString(),
      status: 'IDLE',
      rootPath: join(libraryRoot, 'projects', id)
    })
    return { id }
  }

  function findTrack(tracks: RecordingTrackHandle[], type: RecordingTrackHandle['type']): string {
    const handle = tracks.find((track) => track.type === type)
    if (!handle) throw new Error(`Trilha ${type} nao encontrada na resposta de start()`)
    return handle.trackId
  }

  describe('detectIncomplete', () => {
    it('marks a project crashed mid-recording as RECOVERABLE (DB and manifest)', async () => {
      const project = createProject()
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const trackId = findTrack(tracks, 'MICROPHONE')
      await manager.appendChunk(trackId, 1, 0, 'audio/webm', new Uint8Array([1, 2, 3]))
      // Nunca chama stop() - simula o processo morrendo aqui.

      const detected = await recovery.detectIncomplete()
      expect(detected).toEqual([project.id])

      const updated = projectRepository.findById(project.id)
      expect(updated?.status).toBe('RECOVERABLE')

      const paths = buildProjectPaths(libraryRoot, project.id)
      const manifest = await readManifest(paths.manifestPath)
      expect(manifest?.status).toBe('RECOVERABLE')
    })

    it('ignores a fresh project that never started recording (IDLE)', async () => {
      createProject()
      const detected = await recovery.detectIncomplete()
      expect(detected).toEqual([])
    })

    it('ignores a project that finished cleanly (COMPLETED)', async () => {
      const project = createProject()
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const trackId = findTrack(tracks, 'MICROPHONE')
      await manager.appendChunk(trackId, 1, 0, 'audio/webm', new Uint8Array([1, 2, 3]))
      await manager.stop(project.id)

      const detected = await recovery.detectIncomplete()
      expect(detected).toEqual([])
      expect(projectRepository.findById(project.id)?.status).toBe('COMPLETED')
    })

    it('is idempotent - a second run finds nothing new for an already-RECOVERABLE project', async () => {
      const project = createProject()
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const trackId = findTrack(tracks, 'MICROPHONE')
      await manager.appendChunk(trackId, 1, 0, 'audio/webm', new Uint8Array([1, 2, 3]))

      await recovery.detectIncomplete()
      const secondRun = await recovery.detectIncomplete()
      expect(secondRun).toEqual([])
    })
  })

  describe('repair', () => {
    it('rejects a project that is not RECOVERABLE', async () => {
      const project = createProject()
      await expect(recovery.repair(project.id)).rejects.toThrow('nao esta em estado recuperavel')
    })

    it('rejects an unknown project id', async () => {
      await expect(recovery.repair(randomUUID())).rejects.toThrow('nao encontrado')
    })

    it('recovers a project with a valid open segment to COMPLETED, using the real file size on disk', async () => {
      const project = createProject()
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const trackId = findTrack(tracks, 'MICROPHONE')
      await manager.appendChunk(trackId, 1, 0, 'audio/webm', new Uint8Array([1, 2, 3, 4, 5]))
      await recovery.detectIncomplete()

      const result = await recovery.repair(project.id)
      expect(result).toEqual({
        projectId: project.id,
        status: 'COMPLETED',
        recoveredSegments: 1,
        discardedSegments: 0
      })

      const updated = projectRepository.findById(project.id)
      expect(updated?.status).toBe('COMPLETED')

      const segments = segmentRepository.listByTrack(trackId)
      expect(segments).toHaveLength(1)
      expect(segments[0]?.finalized).toBe(true)
      expect(segments[0]?.byteSize).toBe(5)

      const paths = buildProjectPaths(libraryRoot, project.id)
      const manifest = await readManifest(paths.manifestPath)
      expect(manifest?.status).toBe('COMPLETED')
      expect(manifest?.tracks).toHaveLength(1)
      expect(manifest?.tracks[0]?.segments).toHaveLength(1)
      expect(manifest?.tracks[0]?.segments[0]?.finalized).toBe(true)
    })

    it('discards a zero-byte segment and marks the project FAILED when nothing survives', async () => {
      const project = createProject()
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const trackId = findTrack(tracks, 'MICROPHONE')
      // Cria o segmento (arquivo + linha no banco) mas sem nenhum byte real - crash antes do
      // primeiro chunk de dados de fato chegar ao disco.
      await manager.appendChunk(trackId, 1, 0, 'audio/webm', new Uint8Array([]))
      await recovery.detectIncomplete()

      const result = await recovery.repair(project.id)
      expect(result).toEqual({
        projectId: project.id,
        status: 'FAILED',
        recoveredSegments: 0,
        discardedSegments: 1
      })
      expect(projectRepository.findById(project.id)?.status).toBe('FAILED')
      expect(segmentRepository.listByTrack(trackId)).toHaveLength(0)
    })

    it('keeps only the tracks that actually survived when multiple tracks crash differently', async () => {
      const project = createProject()
      const { tracks } = await manager.start(project.id, ['MICROPHONE', 'CAMERA'])
      const micTrackId = findTrack(tracks, 'MICROPHONE')
      const cameraTrackId = findTrack(tracks, 'CAMERA')
      await manager.appendChunk(micTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 2, 3]))
      await manager.appendChunk(cameraTrackId, 1, 0, 'video/webm', new Uint8Array([]))
      await recovery.detectIncomplete()

      const result = await recovery.repair(project.id)
      expect(result.status).toBe('COMPLETED')
      expect(result.recoveredSegments).toBe(1)
      expect(result.discardedSegments).toBe(1)

      const paths = buildProjectPaths(libraryRoot, project.id)
      const manifest = await readManifest(paths.manifestPath)
      expect(manifest?.tracks).toHaveLength(1)
      expect(manifest?.tracks[0]?.id).toBe(micTrackId)
      expect(segmentRepository.listByTrack(cameraTrackId)).toHaveLength(0)
    })

    it('still recovers from the database when the manifest file is missing entirely', async () => {
      const project = createProject()
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const trackId = findTrack(tracks, 'MICROPHONE')
      await manager.appendChunk(trackId, 1, 0, 'audio/webm', new Uint8Array([9, 9, 9]))
      await recovery.detectIncomplete()

      const paths = buildProjectPaths(libraryRoot, project.id)
      await rm(paths.manifestPath, { force: true })

      const result = await recovery.repair(project.id)
      expect(result.status).toBe('COMPLETED')
      expect(result.recoveredSegments).toBe(1)

      const manifest = await readManifest(paths.manifestPath)
      expect(manifest?.status).toBe('COMPLETED')
      expect(manifest?.tracks[0]?.segments).toHaveLength(1)
    })
  })
})
