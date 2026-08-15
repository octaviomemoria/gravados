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
  MarkerRepository,
  EditOperationRepository
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
  let editOperationRepository: EditOperationRepository
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
    editOperationRepository = new EditOperationRepository(client.db)
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
      segmentRepository,
      editOperationRepository,
      client.db
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

  /** EDIT-004/005/006 (decimo setimo incremento - primeira operacao de edicao real). Segmentos
   * com `startedAtMs` FIXO (nao via `RecordingSessionManager` real, que tem alguns ms de overhead
   * assincrono) - o objetivo aqui e matematica de corte PRECISA, ja coberta em profundidade pelos
   * testes puros de `applyRemoveRange` (`tests/unit/main/apply-remove-range.test.ts`); estes
   * testes so confirmam que o SERVICO (validacao, persistencia, sequenciamento, revision) liga tudo
   * corretamente. */
  describe('getEditedTimeline / removeRange', () => {
    function createTrackWithSegment(
      projectId: string,
      type: 'MICROPHONE' | 'CAMERA',
      startMs: number,
      endMs: number
    ): string {
      const trackId = randomUUID()
      trackRepository.create({
        id: trackId,
        projectId,
        type,
        enabled: true,
        position: 0,
        startOffsetMs: 0
      })
      segmentRepository.create({
        id: randomUUID(),
        trackId,
        seqIndex: 1,
        relativePath: `source/${type.toLowerCase()}/${type.toLowerCase()}_000001.webm`,
        startedAtMs: startMs,
        endedAtMs: endMs,
        durationMs: endMs - startMs,
        byteSize: 1000,
        mimeType: type === 'CAMERA' ? 'video/webm' : 'audio/webm',
        finalized: true
      })
      return trackId
    }

    it('equals getTimeline (plus canUndo/canRedo both false) when no operations exist yet', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      expect(service.getEditedTimeline(editProject.id)).toEqual({
        ...service.getTimeline(editProject.id),
        canUndo: false,
        canRedo: false,
        // EDIT-011 - layoutPreset so existe na timeline EDITADA (igual canUndo/canRedo), nao na
        // bruta - PIP e o padrao sem nenhum SET_LAYOUT ativo.
        layoutPreset: 'PIP'
      })
    })

    it('reflects a REMOVE_RANGE operation and shrinks totalDurationMs accordingly', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      const result = service.removeRange(editProject.id, 1000, 2000)
      expect(result.totalDurationMs).toBe(4000)
      expect(result.tracks[0]!.clips).toEqual([
        expect.objectContaining({ startMs: 0, endMs: 1000 }),
        expect.objectContaining({ startMs: 1000, endMs: 4000, sourceStartMs: 2000 })
      ])

      const edited = service.getEditedTimeline(editProject.id)
      expect(edited).toEqual(result)
    })

    it('composes two REMOVE_RANGE operations in sequence, each relative to the timeline as edited so far', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 10_000)
      const editProject = service.createEditProject(project.id)

      // Primeiro corte: [1000,2000) de uma timeline de 10000ms -> sobra 9000ms.
      service.removeRange(editProject.id, 1000, 2000)
      // Segundo corte: [1000,3000) DA TIMELINE JA EDITADA (9000ms), nao da original.
      const result = service.removeRange(editProject.id, 1000, 3000)

      expect(result.totalDurationMs).toBe(7000)
    })

    it('bumps the edit project revision on every successful removeRange', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      expect(editProject.revision).toBe(1)

      service.removeRange(editProject.id, 1000, 2000)
      expect(service.getEditProject(editProject.id).revision).toBe(2)

      service.removeRange(editProject.id, 1000, 1500)
      expect(service.getEditProject(editProject.id).revision).toBe(3)
    })

    it('rejects a range where startMs >= endMs', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      expect(() => service.removeRange(editProject.id, 2000, 2000)).toThrow()
      expect(() => service.removeRange(editProject.id, 3000, 1000)).toThrow()
    })

    it('rejects a range extending past the current edited timeline duration', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      expect(() => service.removeRange(editProject.id, 4000, 6000)).toThrow()
    })

    it('applies the same cut across multiple tracks simultaneously', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      const editProject = service.createEditProject(project.id)

      const result = service.removeRange(editProject.id, 1000, 2000)
      expect(result.tracks).toHaveLength(2)
      for (const track of result.tracks) {
        expect(track.clips.reduce((sum, clip) => sum + (clip.endMs - clip.startMs), 0)).toBe(4000)
      }
    })

    it('throws NotFoundError for an unknown edit project on getEditedTimeline', () => {
      expect(() => service.getEditedTimeline(randomUUID())).toThrow('nao encontrado')
    })

    it('reports canUndo/canRedo correctly across a cut', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      expect(service.getEditedTimeline(editProject.id)).toMatchObject({
        canUndo: false,
        canRedo: false
      })

      const afterCut = service.removeRange(editProject.id, 1000, 2000)
      expect(afterCut.canUndo).toBe(true)
      expect(afterCut.canRedo).toBe(false)
    })
  })

  /** EDIT-007 (decimo oitavo incremento - desfazer/refazer). */
  describe('undo / redo', () => {
    function createTrackWithSegment(
      projectId: string,
      type: 'MICROPHONE' | 'CAMERA',
      startMs: number,
      endMs: number
    ): string {
      const trackId = randomUUID()
      trackRepository.create({
        id: trackId,
        projectId,
        type,
        enabled: true,
        position: 0,
        startOffsetMs: 0
      })
      segmentRepository.create({
        id: randomUUID(),
        trackId,
        seqIndex: 1,
        relativePath: `source/${type.toLowerCase()}/${type.toLowerCase()}_000001.webm`,
        startedAtMs: startMs,
        endedAtMs: endMs,
        durationMs: endMs - startMs,
        byteSize: 1000,
        mimeType: type === 'CAMERA' ? 'video/webm' : 'audio/webm',
        finalized: true
      })
      return trackId
    }

    it('rejects undo when there is nothing to undo', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      expect(() => service.undo(editProject.id)).toThrow('Nao ha nada')
    })

    it('rejects redo when there is nothing to redo', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      expect(() => service.redo(editProject.id)).toThrow('Nao ha nada')
    })

    it('undo reverts the timeline to its state before the last cut, without deleting the operation', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      const beforeCut = service.getEditedTimeline(editProject.id)
      service.removeRange(editProject.id, 1000, 2000)

      const afterUndo = service.undo(editProject.id)
      expect(afterUndo.totalDurationMs).toBe(beforeCut.totalDurationMs)
      expect(afterUndo.canUndo).toBe(false)
      expect(afterUndo.canRedo).toBe(true)
    })

    it('redo re-applies the operation that was just undone', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      const afterCut = service.removeRange(editProject.id, 1000, 2000)
      service.undo(editProject.id)
      const afterRedo = service.redo(editProject.id)

      expect(afterRedo.totalDurationMs).toBe(afterCut.totalDurationMs)
      expect(afterRedo.canUndo).toBe(true)
      expect(afterRedo.canRedo).toBe(false)
    })

    it('supports multiple undo/redo cycles across two cuts, in the correct order', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 10_000)
      const editProject = service.createEditProject(project.id)

      service.removeRange(editProject.id, 1000, 2000) // -> 9000ms
      const afterSecondCut = service.removeRange(editProject.id, 1000, 3000) // -> 7000ms (relative to 9000)

      const afterOneUndo = service.undo(editProject.id)
      expect(afterOneUndo.totalDurationMs).toBe(9000)

      const afterTwoUndos = service.undo(editProject.id)
      expect(afterTwoUndos.totalDurationMs).toBe(10_000)
      expect(afterTwoUndos.canUndo).toBe(false)

      const afterOneRedo = service.redo(editProject.id)
      expect(afterOneRedo.totalDurationMs).toBe(9000)

      const afterTwoRedos = service.redo(editProject.id)
      expect(afterTwoRedos.totalDurationMs).toBe(afterSecondCut.totalDurationMs)
      expect(afterTwoRedos.canRedo).toBe(false)
    })

    it('creating a new operation after an undo prunes the abandoned redo branch permanently', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 10_000)
      const editProject = service.createEditProject(project.id)

      service.removeRange(editProject.id, 1000, 2000) // -> 9000ms, sequence 1
      service.undo(editProject.id) // cursor back to 0, sequence 1 still exists but inactive

      // Uma operacao NOVA (diferente da que foi desfeita) - deve podar a sequence 1 abandonada.
      const afterNewCut = service.removeRange(editProject.id, 5000, 6000) // -> 9000ms
      expect(afterNewCut.totalDurationMs).toBe(9000)
      expect(afterNewCut.canRedo).toBe(false)

      // O "refazer" antigo nao existe mais - undo desta nova operacao volta direto pra bruta.
      const afterUndoingNew = service.undo(editProject.id)
      expect(afterUndoingNew.totalDurationMs).toBe(10_000)
      expect(afterUndoingNew.canRedo).toBe(true)
      const afterRedoingNew = service.redo(editProject.id)
      expect(afterRedoingNew.totalDurationMs).toBe(9000)
    })

    it('bumps the edit project revision on undo and redo, same as a cut', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.removeRange(editProject.id, 1000, 2000)
      const afterCutRevision = service.getEditProject(editProject.id).revision
      service.undo(editProject.id)
      expect(service.getEditProject(editProject.id).revision).toBe(afterCutRevision + 1)
      service.redo(editProject.id)
      expect(service.getEditProject(editProject.id).revision).toBe(afterCutRevision + 2)
    })

    it('throws NotFoundError for an unknown edit project on undo/redo', () => {
      expect(() => service.undo(randomUUID())).toThrow('nao encontrado')
      expect(() => service.redo(randomUUID())).toThrow('nao encontrado')
    })
  })

  describe('setTrackGain', () => {
    function createTrackWithSegment(
      projectId: string,
      type: 'MICROPHONE' | 'CAMERA',
      startMs: number,
      endMs: number
    ): string {
      const trackId = randomUUID()
      trackRepository.create({
        id: trackId,
        projectId,
        type,
        enabled: true,
        position: 0,
        startOffsetMs: 0
      })
      segmentRepository.create({
        id: randomUUID(),
        trackId,
        seqIndex: 1,
        relativePath: `source/${type.toLowerCase()}/${type.toLowerCase()}_000001.webm`,
        startedAtMs: startMs,
        endedAtMs: endMs,
        durationMs: endMs - startMs,
        byteSize: 1000,
        mimeType: type === 'CAMERA' ? 'video/webm' : 'audio/webm',
        finalized: true
      })
      return trackId
    }

    it('raw getTimeline always reports gainDb 0 and muted false, before any SET_GAIN', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      const raw = service.getTimeline(editProject.id)
      expect(raw.tracks[0]).toMatchObject({ gainDb: 0, muted: false })
    })

    it('applies gainDb/muted to the target track and leaves other tracks untouched', () => {
      const project = createProject('COMPLETED')
      const micTrackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      const editProject = service.createEditProject(project.id)

      const updated = service.setTrackGain(editProject.id, micTrackId, -12, true)
      const micTrack = updated.tracks.find((track) => track.id === micTrackId)!
      const otherTrack = updated.tracks.find((track) => track.id !== micTrackId)!
      expect(micTrack).toMatchObject({ gainDb: -12, muted: true })
      expect(otherTrack).toMatchObject({ gainDb: 0, muted: false })
    })

    it('a second SET_GAIN on the same track REPLACES the previous state, does not accumulate', () => {
      const project = createProject('COMPLETED')
      const trackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackGain(editProject.id, trackId, -30, false)
      const updated = service.setTrackGain(editProject.id, trackId, -6, true)
      expect(updated.tracks[0]).toMatchObject({ gainDb: -6, muted: true })
    })

    it('rejects a trackId that does not exist in the current edited timeline', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      expect(() => service.setTrackGain(editProject.id, randomUUID(), -6, false)).toThrow(
        'nao encontrada'
      )
    })

    it('bumps the edit project revision, same as removeRange', () => {
      const project = createProject('COMPLETED')
      const trackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      const before = service.getEditProject(editProject.id).revision
      service.setTrackGain(editProject.id, trackId, -6, false)
      expect(service.getEditProject(editProject.id).revision).toBe(before + 1)
    })

    it('is undoable/redoable, same as any other operation on the log', () => {
      const project = createProject('COMPLETED')
      const trackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackGain(editProject.id, trackId, -20, true)
      const afterUndo = service.undo(editProject.id)
      expect(afterUndo.tracks[0]).toMatchObject({ gainDb: 0, muted: false })

      const afterRedo = service.redo(editProject.id)
      expect(afterRedo.tracks[0]).toMatchObject({ gainDb: -20, muted: true })
    })

    it('a SET_GAIN created after an undo prunes the abandoned redo branch, same as removeRange', () => {
      const project = createProject('COMPLETED')
      const trackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackGain(editProject.id, trackId, -20, false)
      service.undo(editProject.id)

      const afterNewGain = service.setTrackGain(editProject.id, trackId, -40, true)
      expect(afterNewGain.tracks[0]).toMatchObject({ gainDb: -40, muted: true })
      expect(afterNewGain.canRedo).toBe(false)
    })

    it('a SET_GAIN targeting a track later fully removed by REMOVE_RANGE has no visible effect (no crash)', () => {
      const project = createProject('COMPLETED')
      const micTrackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackGain(editProject.id, micTrackId, -20, true)
      const afterCut = service.removeRange(editProject.id, 0, 5000)
      expect(afterCut.tracks).toHaveLength(0)
    })

    it('throws NotFoundError for an unknown edit project', () => {
      expect(() => service.setTrackGain(randomUUID(), randomUUID(), -6, false)).toThrow(
        'nao encontrado'
      )
    })
  })

  describe('setTrackFade', () => {
    function createTrackWithSegment(
      projectId: string,
      type: 'MICROPHONE' | 'CAMERA',
      startMs: number,
      endMs: number
    ): string {
      const trackId = randomUUID()
      trackRepository.create({
        id: trackId,
        projectId,
        type,
        enabled: true,
        position: 0,
        startOffsetMs: 0
      })
      segmentRepository.create({
        id: randomUUID(),
        trackId,
        seqIndex: 1,
        relativePath: `source/${type.toLowerCase()}/${type.toLowerCase()}_000001.webm`,
        startedAtMs: startMs,
        endedAtMs: endMs,
        durationMs: endMs - startMs,
        byteSize: 1000,
        mimeType: type === 'CAMERA' ? 'video/webm' : 'audio/webm',
        finalized: true
      })
      return trackId
    }

    it('raw getTimeline always reports fadeInMs/fadeOutMs 0, before any SET_FADE', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      const raw = service.getTimeline(editProject.id)
      expect(raw.tracks[0]).toMatchObject({ fadeInMs: 0, fadeOutMs: 0 })
    })

    it('applies fadeInMs/fadeOutMs to the target track and leaves other tracks untouched', () => {
      const project = createProject('COMPLETED')
      const micTrackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      const editProject = service.createEditProject(project.id)

      const updated = service.setTrackFade(editProject.id, micTrackId, 1000, 2000)
      const micTrack = updated.tracks.find((track) => track.id === micTrackId)!
      const otherTrack = updated.tracks.find((track) => track.id !== micTrackId)!
      expect(micTrack).toMatchObject({ fadeInMs: 1000, fadeOutMs: 2000 })
      expect(otherTrack).toMatchObject({ fadeInMs: 0, fadeOutMs: 0 })
    })

    it('a second SET_FADE on the same track REPLACES the previous state, does not accumulate', () => {
      const project = createProject('COMPLETED')
      const trackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackFade(editProject.id, trackId, 500, 500)
      const updated = service.setTrackFade(editProject.id, trackId, 3000, 1000)
      expect(updated.tracks[0]).toMatchObject({ fadeInMs: 3000, fadeOutMs: 1000 })
    })

    it('rejects a trackId that does not exist in the current edited timeline', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      expect(() => service.setTrackFade(editProject.id, randomUUID(), 1000, 1000)).toThrow(
        'nao encontrada'
      )
    })

    it('bumps the edit project revision, same as removeRange/setTrackGain', () => {
      const project = createProject('COMPLETED')
      const trackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      const before = service.getEditProject(editProject.id).revision
      service.setTrackFade(editProject.id, trackId, 1000, 1000)
      expect(service.getEditProject(editProject.id).revision).toBe(before + 1)
    })

    it('is undoable/redoable, same as any other operation on the log', () => {
      const project = createProject('COMPLETED')
      const trackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackFade(editProject.id, trackId, 1000, 2000)
      const afterUndo = service.undo(editProject.id)
      expect(afterUndo.tracks[0]).toMatchObject({ fadeInMs: 0, fadeOutMs: 0 })

      const afterRedo = service.redo(editProject.id)
      expect(afterRedo.tracks[0]).toMatchObject({ fadeInMs: 1000, fadeOutMs: 2000 })
    })

    it('a SET_FADE created after an undo prunes the abandoned redo branch, same as removeRange', () => {
      const project = createProject('COMPLETED')
      const trackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackFade(editProject.id, trackId, 1000, 1000)
      service.undo(editProject.id)

      const afterNewFade = service.setTrackFade(editProject.id, trackId, 2500, 500)
      expect(afterNewFade.tracks[0]).toMatchObject({ fadeInMs: 2500, fadeOutMs: 500 })
      expect(afterNewFade.canRedo).toBe(false)
    })

    it('a SET_FADE targeting a track later fully removed by REMOVE_RANGE has no visible effect (no crash)', () => {
      const project = createProject('COMPLETED')
      const micTrackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackFade(editProject.id, micTrackId, 1000, 1000)
      const afterCut = service.removeRange(editProject.id, 0, 5000)
      expect(afterCut.tracks).toHaveLength(0)
    })

    it('SET_GAIN and SET_FADE on the same track coexist independently', () => {
      const project = createProject('COMPLETED')
      const trackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackGain(editProject.id, trackId, -12, true)
      const updated = service.setTrackFade(editProject.id, trackId, 1000, 1000)
      expect(updated.tracks[0]).toMatchObject({
        gainDb: -12,
        muted: true,
        fadeInMs: 1000,
        fadeOutMs: 1000
      })
    })

    it('throws NotFoundError for an unknown edit project', () => {
      expect(() => service.setTrackFade(randomUUID(), randomUUID(), 1000, 1000)).toThrow(
        'nao encontrado'
      )
    })
  })

  describe('setTrackTransform', () => {
    function createTrackWithSegment(
      projectId: string,
      type: 'MICROPHONE' | 'CAMERA',
      startMs: number,
      endMs: number
    ): string {
      const trackId = randomUUID()
      trackRepository.create({
        id: trackId,
        projectId,
        type,
        enabled: true,
        position: 0,
        startOffsetMs: 0
      })
      segmentRepository.create({
        id: randomUUID(),
        trackId,
        seqIndex: 1,
        relativePath: `source/${type.toLowerCase()}/${type.toLowerCase()}_000001.webm`,
        startedAtMs: startMs,
        endedAtMs: endMs,
        durationMs: endMs - startMs,
        byteSize: 1000,
        mimeType: type === 'CAMERA' ? 'video/webm' : 'audio/webm',
        finalized: true
      })
      return trackId
    }

    const CUSTOM_TRANSFORM = {
      visible: false,
      xPercent: 10,
      yPercent: 20,
      widthPercent: 30,
      heightPercent: 40,
      shape: 'circle' as const
    }
    const ANOTHER_TRANSFORM = {
      visible: true,
      xPercent: 50,
      yPercent: 60,
      widthPercent: 15,
      heightPercent: 15,
      shape: 'rectangle' as const
    }

    it('raw getTimeline gives every CAMERA track the default PiP transform, and null for every other type', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      const raw = service.getTimeline(editProject.id)
      const cameraTrack = raw.tracks.find((track) => track.type === 'CAMERA')!
      const micTrack = raw.tracks.find((track) => track.type === 'MICROPHONE')!
      expect(cameraTrack.cameraTransform).toMatchObject({ visible: true, shape: 'rectangle' })
      expect(micTrack.cameraTransform).toBeNull()
    })

    it('applies the transform to the target CAMERA track and leaves other tracks untouched', () => {
      const project = createProject('COMPLETED')
      const cameraTrackId = createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      const updated = service.setTrackTransform(editProject.id, cameraTrackId, CUSTOM_TRANSFORM)
      const cameraTrack = updated.tracks.find((track) => track.id === cameraTrackId)!
      const micTrack = updated.tracks.find((track) => track.type === 'MICROPHONE')!
      expect(cameraTrack.cameraTransform).toEqual(CUSTOM_TRANSFORM)
      expect(micTrack.cameraTransform).toBeNull()
    })

    it('a second SET_CAMERA_TRANSFORM on the same track REPLACES the previous state, does not accumulate', () => {
      const project = createProject('COMPLETED')
      const cameraTrackId = createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackTransform(editProject.id, cameraTrackId, CUSTOM_TRANSFORM)
      const updated = service.setTrackTransform(editProject.id, cameraTrackId, ANOTHER_TRANSFORM)
      expect(updated.tracks[0]!.cameraTransform).toEqual(ANOTHER_TRANSFORM)
    })

    it('rejects a trackId that does not exist in the current edited timeline', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      const editProject = service.createEditProject(project.id)
      expect(() =>
        service.setTrackTransform(editProject.id, randomUUID(), CUSTOM_TRANSFORM)
      ).toThrow('nao encontrada')
    })

    it('rejects a trackId that is not of type CAMERA (position has no meaning for audio, or the screen track is always the background)', () => {
      const project = createProject('COMPLETED')
      const micTrackId = createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      expect(() =>
        service.setTrackTransform(editProject.id, micTrackId, CUSTOM_TRANSFORM)
      ).toThrow('CAMERA')
    })

    it('bumps the edit project revision, same as removeRange/setTrackGain/setTrackFade', () => {
      const project = createProject('COMPLETED')
      const cameraTrackId = createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      const editProject = service.createEditProject(project.id)
      const before = service.getEditProject(editProject.id).revision
      service.setTrackTransform(editProject.id, cameraTrackId, CUSTOM_TRANSFORM)
      expect(service.getEditProject(editProject.id).revision).toBe(before + 1)
    })

    it('is undoable/redoable, same as any other operation on the log', () => {
      const project = createProject('COMPLETED')
      const cameraTrackId = createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackTransform(editProject.id, cameraTrackId, CUSTOM_TRANSFORM)
      const afterUndo = service.undo(editProject.id)
      expect(afterUndo.tracks[0]!.cameraTransform).toMatchObject({ visible: true, xPercent: 70 })

      const afterRedo = service.redo(editProject.id)
      expect(afterRedo.tracks[0]!.cameraTransform).toEqual(CUSTOM_TRANSFORM)
    })

    it('a SET_CAMERA_TRANSFORM created after an undo prunes the abandoned redo branch, same as removeRange', () => {
      const project = createProject('COMPLETED')
      const cameraTrackId = createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackTransform(editProject.id, cameraTrackId, CUSTOM_TRANSFORM)
      service.undo(editProject.id)

      const afterNewTransform = service.setTrackTransform(
        editProject.id,
        cameraTrackId,
        ANOTHER_TRANSFORM
      )
      expect(afterNewTransform.tracks[0]!.cameraTransform).toEqual(ANOTHER_TRANSFORM)
      expect(afterNewTransform.canRedo).toBe(false)
    })

    it('a SET_CAMERA_TRANSFORM targeting a track later fully removed by REMOVE_RANGE has no visible effect (no crash)', () => {
      const project = createProject('COMPLETED')
      const cameraTrackId = createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackTransform(editProject.id, cameraTrackId, CUSTOM_TRANSFORM)
      const afterCut = service.removeRange(editProject.id, 0, 5000)
      expect(afterCut.tracks).toHaveLength(0)
    })

    it('SET_GAIN, SET_FADE and SET_CAMERA_TRANSFORM on the same track coexist independently', () => {
      const project = createProject('COMPLETED')
      const cameraTrackId = createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackGain(editProject.id, cameraTrackId, -12, true)
      service.setTrackFade(editProject.id, cameraTrackId, 1000, 1000)
      const updated = service.setTrackTransform(editProject.id, cameraTrackId, CUSTOM_TRANSFORM)
      expect(updated.tracks[0]).toMatchObject({
        gainDb: -12,
        muted: true,
        fadeInMs: 1000,
        fadeOutMs: 1000,
        cameraTransform: CUSTOM_TRANSFORM
      })
    })

    it('throws NotFoundError for an unknown edit project', () => {
      expect(() =>
        service.setTrackTransform(randomUUID(), randomUUID(), CUSTOM_TRANSFORM)
      ).toThrow('nao encontrado')
    })
  })

  describe('setLayoutPreset', () => {
    function createTrackWithSegment(
      projectId: string,
      type: 'MICROPHONE' | 'CAMERA',
      startMs: number,
      endMs: number
    ): string {
      const trackId = randomUUID()
      trackRepository.create({
        id: trackId,
        projectId,
        type,
        enabled: true,
        position: 0,
        startOffsetMs: 0
      })
      segmentRepository.create({
        id: randomUUID(),
        trackId,
        seqIndex: 1,
        relativePath: `source/${type.toLowerCase()}/${type.toLowerCase()}_000001.webm`,
        startedAtMs: startMs,
        endedAtMs: endMs,
        durationMs: endMs - startMs,
        byteSize: 1000,
        mimeType: type === 'CAMERA' ? 'video/webm' : 'audio/webm',
        finalized: true
      })
      return trackId
    }

    it('raw getEditedTimeline reports layoutPreset PIP before any SET_LAYOUT', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      expect(service.getEditedTimeline(editProject.id).layoutPreset).toBe('PIP')
    })

    it('applies the chosen preset to the whole composition (no trackId involved)', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      const updated = service.setLayoutPreset(editProject.id, 'SIDE_BY_SIDE')
      expect(updated.layoutPreset).toBe('SIDE_BY_SIDE')
    })

    it('a second SET_LAYOUT REPLACES the previous preset, does not accumulate', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      service.setLayoutPreset(editProject.id, 'SCREEN_ONLY')
      const updated = service.setLayoutPreset(editProject.id, 'CAMERA_ONLY')
      expect(updated.layoutPreset).toBe('CAMERA_ONLY')
    })

    it('accepts any preset even when the corresponding tracks do not exist in the recording', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      // Gravacao so tem MICROFONE (sem tela/camera) - SIDE_BY_SIDE nao muda nada visualmente na
      // UI (ver computePreviewLayout, renderer), mas o preset em si e sempre valido de gravar.
      const updated = service.setLayoutPreset(editProject.id, 'SIDE_BY_SIDE')
      expect(updated.layoutPreset).toBe('SIDE_BY_SIDE')
    })

    it('bumps the edit project revision, same as removeRange/setTrackGain/setTrackFade/setTrackTransform', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)
      const before = service.getEditProject(editProject.id).revision
      service.setLayoutPreset(editProject.id, 'SCREEN_ONLY')
      expect(service.getEditProject(editProject.id).revision).toBe(before + 1)
    })

    it('is undoable/redoable, same as any other operation on the log', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setLayoutPreset(editProject.id, 'SCREEN_ONLY')
      const afterUndo = service.undo(editProject.id)
      expect(afterUndo.layoutPreset).toBe('PIP')

      const afterRedo = service.redo(editProject.id)
      expect(afterRedo.layoutPreset).toBe('SCREEN_ONLY')
    })

    it('a SET_LAYOUT created after an undo prunes the abandoned redo branch, same as removeRange', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setLayoutPreset(editProject.id, 'SCREEN_ONLY')
      service.undo(editProject.id)

      const afterNewLayout = service.setLayoutPreset(editProject.id, 'CAMERA_ONLY')
      expect(afterNewLayout.layoutPreset).toBe('CAMERA_ONLY')
      expect(afterNewLayout.canRedo).toBe(false)
    })

    it('SET_GAIN, SET_FADE, SET_CAMERA_TRANSFORM and SET_LAYOUT coexist independently', () => {
      const project = createProject('COMPLETED')
      const cameraTrackId = createTrackWithSegment(project.id, 'CAMERA', 0, 5000)
      const editProject = service.createEditProject(project.id)

      service.setTrackGain(editProject.id, cameraTrackId, -12, true)
      service.setLayoutPreset(editProject.id, 'SIDE_BY_SIDE')
      const updated = service.getEditedTimeline(editProject.id)
      expect(updated.layoutPreset).toBe('SIDE_BY_SIDE')
      expect(updated.tracks[0]).toMatchObject({ gainDb: -12, muted: true })
    })

    it('throws NotFoundError for an unknown edit project', () => {
      expect(() => service.setLayoutPreset(randomUUID(), 'PIP')).toThrow('nao encontrado')
    })
  })

  describe('appendOperation atomicity (EDIT-012)', () => {
    function createTrackWithSegment(
      projectId: string,
      type: 'MICROPHONE',
      startMs: number,
      endMs: number
    ): string {
      const trackId = randomUUID()
      trackRepository.create({
        id: trackId,
        projectId,
        type,
        enabled: true,
        position: 0,
        startOffsetMs: 0
      })
      segmentRepository.create({
        id: randomUUID(),
        trackId,
        seqIndex: 1,
        relativePath: `source/${type.toLowerCase()}/${type.toLowerCase()}_000001.webm`,
        startedAtMs: startMs,
        endedAtMs: endMs,
        durationMs: endMs - startMs,
        byteSize: 1000,
        mimeType: 'audio/webm',
        finalized: true
      })
      return trackId
    }

    it('a failure mid-write rolls back the WHOLE operation (no orphaned row, cursor/revision unchanged) - the bug EDIT-012 fixes', () => {
      const project = createProject('COMPLETED')
      createTrackWithSegment(project.id, 'MICROPHONE', 0, 10_000)
      const editProject = service.createEditProject(project.id)

      // Uma operacao bem-sucedida antes da falha, pra confirmar que ela sobrevive intacta.
      service.removeRange(editProject.id, 1000, 2000)
      const beforeFailure = service.getEditProject(editProject.id)
      expect(beforeFailure.activeOperationSequence).toBe(1)
      const operationsBeforeFailure = editOperationRepository.listByEditProject(editProject.id)
      expect(operationsBeforeFailure).toHaveLength(1)

      // Simula um crash no MEIO de appendOperation - o `create` (segunda das tres escritas)
      // lanca, depois de `deleteAfterSequence` ja ter rodado (nao ha nada a apagar aqui, mas o
      // ponto e simular uma falha DEPOIS do inicio da transacao).
      const originalCreate = editOperationRepository.create.bind(editOperationRepository)
      editOperationRepository.create = () => {
        throw new Error('crash simulado no meio da escrita')
      }
      try {
        expect(() => service.removeRange(editProject.id, 500, 800)).toThrow(
          'crash simulado no meio da escrita'
        )
      } finally {
        editOperationRepository.create = originalCreate
      }

      // Nada mudou - nem o cursor/revision, nem o log ganhou uma linha orfa ou perdeu a que ja
      // existia. Sem a transacao (pre-EDIT-012), o cursor ficaria dessincronizado do log.
      const afterFailure = service.getEditProject(editProject.id)
      expect(afterFailure.activeOperationSequence).toBe(beforeFailure.activeOperationSequence)
      expect(afterFailure.revision).toBe(beforeFailure.revision)
      const operationsAfterFailure = editOperationRepository.listByEditProject(editProject.id)
      expect(operationsAfterFailure).toHaveLength(1)
      expect(operationsAfterFailure[0]!.sequence).toBe(1)

      // O servico continua funcional depois - uma operacao nova, bem-sucedida, funciona igual.
      const afterRecovery = service.removeRange(editProject.id, 500, 800)
      expect(afterRecovery.canUndo).toBe(true)
      expect(editOperationRepository.listByEditProject(editProject.id)).toHaveLength(2)
    })
  })
})
