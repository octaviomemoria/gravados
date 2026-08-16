import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
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
import { ProjectService } from '../../../src/main/services/project.service'
import type { DatabaseClient } from '../../../src/main/database/client'
import type { RecordingTrackHandle } from '../../../src/shared/schemas/recording.schema'

/**
 * LIB-002/LIB-004/LIB-006 (decimo primeiro incremento - Fase 2, Biblioteca). Reaproveita o mesmo
 * `RecordingSessionManager` real dos testes de gravacao/recuperacao para produzir trilhas/
 * segmentos reais (dados que `getProjectDetails` precisa agregar, e um estado "gravacao ativa"
 * real que `renameProject`/`deleteProject` precisam rejeitar).
 */
describe('ProjectService', () => {
  let client: DatabaseClient
  let libraryRoot: string
  let manager: RecordingSessionManager
  let service: ProjectService
  let projectRepository: ProjectRepository

  beforeEach(async () => {
    client = createTestDatabase()
    libraryRoot = await mkdtemp(join(tmpdir(), 'meeting-studio-project-service-test-'))
    projectRepository = new ProjectRepository(client.db)
    const trackRepository = new TrackRepository(client.db)
    const segmentRepository = new SegmentRepository(client.db)
    const markerRepository = new MarkerRepository(client.db)
    manager = new RecordingSessionManager(
      projectRepository,
      trackRepository,
      segmentRepository,
      markerRepository,
      new RecordingStateMachine(),
      libraryRoot
    )
    service = new ProjectService(projectRepository, trackRepository, segmentRepository, libraryRoot)
  })

  afterEach(async () => {
    client.close()
    await rm(libraryRoot, { recursive: true, force: true })
  })

  function findTrack(tracks: RecordingTrackHandle[], type: RecordingTrackHandle['type']): string {
    const handle = tracks.find((track) => track.type === type)
    if (!handle) throw new Error(`Trilha ${type} nao encontrada na resposta de start()`)
    return handle.trackId
  }

  describe('getProjectDetails', () => {
    it('throws NotFoundError for an unknown project', () => {
      expect(() => service.getProjectDetails(randomUUID())).toThrow('nao encontrado')
    })

    it('returns zero tracks/bytes for a project that never recorded anything', async () => {
      const project = await service.createProject('Reuniao vazia')
      const result = service.getProjectDetails(project.id)
      expect(result.tracks).toEqual([])
      expect(result.totalBytes).toBe(0)
    })

    it('aggregates segment count and byte size per track and overall', async () => {
      const project = await service.createProject('Reuniao com dados')
      const { tracks } = await manager.start(project.id, ['MICROPHONE', 'CAMERA'])
      const micTrackId = findTrack(tracks, 'MICROPHONE')
      const cameraTrackId = findTrack(tracks, 'CAMERA')
      await manager.appendChunk(micTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 2, 3]))
      await manager.appendChunk(cameraTrackId, 1, 0, 'video/webm', new Uint8Array([1, 2, 3, 4, 5]))
      await manager.stop(project.id)

      const result = service.getProjectDetails(project.id)
      expect(result.totalBytes).toBe(8)
      expect(result.tracks).toHaveLength(2)
      const mic = result.tracks.find((track) => track.type === 'MICROPHONE')
      const camera = result.tracks.find((track) => track.type === 'CAMERA')
      expect(mic).toMatchObject({ segmentCount: 1, totalBytes: 3 })
      expect(camera).toMatchObject({ segmentCount: 1, totalBytes: 5 })
      // Refinamento pos-AI-002-LOCAL - `segments` expõe o suficiente pra Biblioteca montar uma URL
      // de player (`buildMeetingMediaUrl`) sem precisar de um projeto de edição.
      expect(mic!.segments).toHaveLength(1)
      expect(mic!.segments[0]!.relativePath).toMatch(/microphone.*\.webm$/)
      expect(mic!.segments[0]!.startedAtMs).toBeGreaterThan(0)
    })

    it('only includes FINALIZED segments in the per-track segments list', async () => {
      const project = await service.createProject('Reuniao com segmento aberto')
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const micTrackId = findTrack(tracks, 'MICROPHONE')
      // Um chunk sozinho, sem `stop()`, deixa o segmento aberto (nunca finalizado) - nao deveria
      // aparecer na lista usada pra montar um player (arquivo ainda em escrita).
      await manager.appendChunk(micTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 2, 3]))

      const result = service.getProjectDetails(project.id)
      const mic = result.tracks.find((track) => track.type === 'MICROPHONE')
      expect(mic!.segmentCount).toBe(1)
      expect(mic!.segments).toEqual([])

      await manager.stop(project.id)
    })
  })

  describe('renameProject', () => {
    it('updates the title and returns the updated project', async () => {
      const project = await service.createProject('Titulo original')
      const renamed = await service.renameProject(project.id, 'Titulo novo')
      expect(renamed.title).toBe('Titulo novo')
      expect(projectRepository.findById(project.id)?.title).toBe('Titulo novo')
    })

    it('throws NotFoundError for an unknown project', async () => {
      await expect(service.renameProject(randomUUID(), 'X')).rejects.toThrow('nao encontrado')
    })

    it('rejects renaming a project with an active recording session', async () => {
      const project = await service.createProject('Em gravacao')
      await manager.start(project.id, ['MICROPHONE'])
      await expect(service.renameProject(project.id, 'Novo titulo')).rejects.toThrow(
        'gravacao em andamento'
      )
    })
  })

  describe('deleteProject', () => {
    it('removes the project row and its directory tree from disk', async () => {
      const project = await service.createProject('Para excluir')
      expect(existsSync(project.rootPath)).toBe(true)

      await service.deleteProject(project.id)

      expect(projectRepository.findById(project.id)).toBeUndefined()
      expect(existsSync(project.rootPath)).toBe(false)
    })

    it('throws NotFoundError for an unknown project', async () => {
      await expect(service.deleteProject(randomUUID())).rejects.toThrow('nao encontrado')
    })

    it('rejects deleting a project with an active recording session, keeping its files intact', async () => {
      const project = await service.createProject('Em gravacao')
      await manager.start(project.id, ['MICROPHONE'])
      await expect(service.deleteProject(project.id)).rejects.toThrow('gravacao em andamento')
      expect(existsSync(project.rootPath)).toBe(true)
      expect(projectRepository.findById(project.id)).toBeDefined()
    })
  })
})
