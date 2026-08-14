import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../fixtures/tmp-db'
import {
  ProjectRepository,
  EditProjectRepository,
  TrackRepository,
  SegmentRepository,
  MarkerRepository
} from '../../../src/main/database/repositories'
import { RecordingStateMachine } from '../../../src/main/recording/recording-state-machine'
import { RecordingSessionManager } from '../../../src/main/recording/recording-session-manager'
import { EditorService } from '../../../src/main/services/editor.service'
import type { DatabaseClient } from '../../../src/main/database/client'
import type { ProjectEntity } from '../../../src/shared/types/entities'
import type { RecordingTrackHandle } from '../../../src/shared/schemas/recording.schema'

/** EDIT-001/EDIT-002 (decimo segundo/decimo terceiro incrementos - Fase 3, Editor MVP). */
describe('EditorService', () => {
  let client: DatabaseClient
  let projectRepository: ProjectRepository
  let editProjectRepository: EditProjectRepository
  let trackRepository: TrackRepository
  let segmentRepository: SegmentRepository
  let manager: RecordingSessionManager
  let service: EditorService
  let libraryRoot: string

  beforeEach(async () => {
    client = createTestDatabase()
    libraryRoot = await mkdtemp(join(tmpdir(), 'meeting-studio-editor-test-'))
    projectRepository = new ProjectRepository(client.db)
    editProjectRepository = new EditProjectRepository(client.db)
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
    service = new EditorService(
      editProjectRepository,
      projectRepository,
      trackRepository,
      segmentRepository
    )
  })

  afterEach(async () => {
    client.close()
    await rm(libraryRoot, { recursive: true, force: true })
  })

  function createProject(status: ProjectEntity['status'] = 'COMPLETED', title = 'Reuniao gravada'): { id: string } {
    const id = randomUUID()
    projectRepository.create({
      id,
      title,
      createdAt: new Date().toISOString(),
      status,
      rootPath: `/library/projects/${id}`
    })
    return { id }
  }

  describe('createEditProject', () => {
    it('creates an edit project for a COMPLETED recording, defaulting the name to the recording title', () => {
      const project = createProject('COMPLETED', 'Reuniao de kickoff')
      const editProject = service.createEditProject(project.id)
      expect(editProject.projectId).toBe(project.id)
      expect(editProject.name).toBe('Reuniao de kickoff')
      expect(editProject.revision).toBe(1)
      expect(editProjectRepository.findById(editProject.id)).toBeDefined()
    })

    it('accepts a custom name', () => {
      const project = createProject('COMPLETED')
      const editProject = service.createEditProject(project.id, 'Versao curta')
      expect(editProject.name).toBe('Versao curta')
    })

    it('throws NotFoundError for an unknown project', () => {
      expect(() => service.createEditProject(randomUUID())).toThrow('nao encontrado')
    })

    it.each(['IDLE', 'RECORDING', 'PAUSED', 'RECOVERABLE', 'FAILED'] as const)(
      'rejects creating an edit project for a recording with status %s',
      (status) => {
        const project = createProject(status)
        expect(() => service.createEditProject(project.id)).toThrow('gravacao concluida')
      }
    )

    it('allows multiple independent edit projects for the same recording', () => {
      const project = createProject('COMPLETED')
      const first = service.createEditProject(project.id, 'Versao completa')
      const second = service.createEditProject(project.id, 'Versao curta')
      expect(first.id).not.toBe(second.id)
      expect(editProjectRepository.listByProject(project.id)).toHaveLength(2)
    })
  })

  describe('getEditProject', () => {
    it('returns an existing edit project by id', () => {
      const project = createProject()
      const created = service.createEditProject(project.id)
      expect(service.getEditProject(created.id)).toEqual(created)
    })

    it('throws NotFoundError for an unknown edit project', () => {
      expect(() => service.getEditProject(randomUUID())).toThrow('nao encontrado')
    })
  })

  describe('listEditProjects', () => {
    it('lists edit projects across different recordings', () => {
      const first = createProject('COMPLETED', 'Reuniao A')
      const second = createProject('COMPLETED', 'Reuniao B')
      service.createEditProject(first.id)
      service.createEditProject(second.id)

      const all = service.listEditProjects()
      expect(all).toHaveLength(2)
      expect(all.map((editProject) => editProject.projectId).sort()).toEqual(
        [first.id, second.id].sort()
      )
    })

    it('returns an empty list when there are no edit projects yet', () => {
      expect(service.listEditProjects()).toEqual([])
    })
  })

  describe('getTimeline', () => {
    function findTrack(
      tracks: RecordingTrackHandle[],
      type: RecordingTrackHandle['type']
    ): string {
      const handle = tracks.find((track) => track.type === type)
      if (!handle) throw new Error(`Trilha ${type} nao encontrada na resposta de start()`)
      return handle.trackId
    }

    it('throws NotFoundError for an unknown edit project', () => {
      expect(() => service.getTimeline(randomUUID())).toThrow('nao encontrado')
    })

    it('returns an empty timeline for a recording with no tracks', () => {
      const project = createProject('COMPLETED')
      const editProject = service.createEditProject(project.id)
      const timeline = service.getTimeline(editProject.id)
      expect(timeline).toEqual({
        editProjectId: editProject.id,
        projectId: project.id,
        totalDurationMs: 0,
        tracks: []
      })
    })

    it('positions a single clip at the start of the timeline', async () => {
      const project = createProject('COMPLETED')
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const micTrackId = findTrack(tracks, 'MICROPHONE')
      await manager.appendChunk(micTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 2, 3]))
      await manager.stop(project.id)
      projectRepository.updateStatus(project.id, 'COMPLETED')

      const editProject = service.createEditProject(project.id)
      const timeline = service.getTimeline(editProject.id)

      expect(timeline.tracks).toHaveLength(1)
      const track = timeline.tracks[0]!
      expect(track.id).toBe(micTrackId)
      expect(track.type).toBe('MICROPHONE')
      expect(track.clips).toHaveLength(1)
      // Proximo de 0, nao necessariamente 0 exato - `openNewSegment` roda alguns ms depois do
      // `Date.now()` capturado no inicio da sessao (overhead assincrono real, nao um bug).
      expect(track.clips[0]!.startMs).toBeGreaterThanOrEqual(0)
      expect(track.clips[0]!.startMs).toBeLessThan(1000)
      expect(track.clips[0]!.byteSize).toBe(3)
      expect(timeline.totalDurationMs).toBe(track.clips[0]!.endMs)
    })

    it('anchors multiple tracks to the same session start, not each track individually', async () => {
      const project = createProject('COMPLETED')
      const { tracks } = await manager.start(project.id, ['MICROPHONE', 'CAMERA'])
      const micTrackId = findTrack(tracks, 'MICROPHONE')
      const cameraTrackId = findTrack(tracks, 'CAMERA')
      await manager.appendChunk(micTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 2, 3]))
      await manager.appendChunk(cameraTrackId, 1, 0, 'video/webm', new Uint8Array([1, 2, 3, 4, 5]))
      await manager.stop(project.id)
      projectRepository.updateStatus(project.id, 'COMPLETED')

      const editProject = service.createEditProject(project.id)
      const timeline = service.getTimeline(editProject.id)

      expect(timeline.tracks).toHaveLength(2)
      // Ambas as trilhas comecaram (poucos ms de diferenca no maximo, mesma sessao) - nenhum
      // clip deveria ficar com um startMs negativo nem muito distante de 0.
      for (const track of timeline.tracks) {
        expect(track.clips[0]!.startMs).toBeGreaterThanOrEqual(0)
        expect(track.clips[0]!.startMs).toBeLessThan(1000)
      }
    })

    it('lists rotated segments as separate, correctly ordered clips on the same track', async () => {
      const project = createProject('COMPLETED')
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const micTrackId = findTrack(tracks, 'MICROPHONE')
      await manager.appendChunk(micTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 2, 3]))
      await manager.appendChunk(micTrackId, 2, 0, 'audio/webm', new Uint8Array([4, 5]))
      await manager.stop(project.id)
      projectRepository.updateStatus(project.id, 'COMPLETED')

      const editProject = service.createEditProject(project.id)
      const timeline = service.getTimeline(editProject.id)

      expect(timeline.tracks).toHaveLength(1)
      const clips = timeline.tracks[0]!.clips
      expect(clips).toHaveLength(2)
      expect(clips[0]!.seqIndex).toBe(1)
      expect(clips[1]!.seqIndex).toBe(2)
      expect(clips[0]!.endMs).toBeLessThanOrEqual(clips[1]!.startMs)
    })

    it('excludes a segment that was never finalized, and the track entirely if none survive', () => {
      const project = createProject('IDLE')
      const trackId = randomUUID()
      trackRepository.create({
        id: trackId,
        projectId: project.id,
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
        startedAtMs: Date.now(),
        endedAtMs: null,
        durationMs: null,
        byteSize: 0,
        mimeType: 'audio/webm',
        finalized: false
      })
      // Simula um estado defensivo/atipico (na pratica so alcancavel via um bug) para provar que
      // o filtro por `finalized` protege a timeline mesmo assim.
      projectRepository.updateStatus(project.id, 'COMPLETED')

      const editProject = service.createEditProject(project.id)
      const timeline = service.getTimeline(editProject.id)
      expect(timeline.tracks).toEqual([])
    })
  })
})
