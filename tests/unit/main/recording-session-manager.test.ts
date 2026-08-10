import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../fixtures/tmp-db'
import {
  ProjectRepository,
  TrackRepository,
  SegmentRepository
} from '../../../src/main/database/repositories'
import { RecordingStateMachine } from '../../../src/main/recording/recording-state-machine'
import { RecordingSessionManager } from '../../../src/main/recording/recording-session-manager'
import type { DatabaseClient } from '../../../src/main/database/client'
import type { RecordingTrackHandle } from '../../../src/shared/schemas/recording.schema'

describe('RecordingSessionManager', () => {
  let client: DatabaseClient
  let libraryRoot: string
  let manager: RecordingSessionManager
  let projectRepository: ProjectRepository
  let segmentRepository: SegmentRepository

  beforeEach(async () => {
    client = createTestDatabase()
    libraryRoot = await mkdtemp(join(tmpdir(), 'meeting-studio-rec-test-'))
    projectRepository = new ProjectRepository(client.db)
    const trackRepository = new TrackRepository(client.db)
    segmentRepository = new SegmentRepository(client.db)
    manager = new RecordingSessionManager(
      projectRepository,
      trackRepository,
      segmentRepository,
      new RecordingStateMachine(),
      libraryRoot
    )
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

  it('rejects starting for a project that does not exist', async () => {
    await expect(manager.start(randomUUID(), ['MICROPHONE'])).rejects.toThrow('nao encontrado')
  })

  it('rejects starting with no track types selected', async () => {
    const project = createProject()
    await expect(manager.start(project.id, [])).rejects.toThrow('ao menos uma fonte')
  })

  it('runs a full start -> appendChunk -> stop cycle (microphone only) and writes bytes to disk', async () => {
    const project = createProject()
    const { tracks, state } = await manager.start(project.id, ['MICROPHONE'])
    expect(state).toBe('RECORDING')
    expect(manager.getState()).toBe('RECORDING')
    const microphoneTrackId = findTrack(tracks, 'MICROPHONE')

    const result1 = await manager.appendChunk(
      microphoneTrackId,
      0,
      'audio/webm',
      new Uint8Array([1, 2, 3, 4])
    )
    expect(result1).toEqual({ receivedBytes: 4, totalBytes: 4 })

    const result2 = await manager.appendChunk(
      microphoneTrackId,
      1,
      'audio/webm',
      new Uint8Array([5, 6])
    )
    expect(result2).toEqual({ receivedBytes: 2, totalBytes: 6 })

    const stopResult = await manager.stop(project.id)
    expect(stopResult.state).toBe('COMPLETED')
    expect(manager.getState()).toBe('IDLE')

    const segments = segmentRepository.listByTrack(microphoneTrackId)
    expect(segments).toHaveLength(1)
    expect(segments[0]?.finalized).toBe(true)
    expect(segments[0]?.byteSize).toBe(6)
    expect(segments[0]?.mimeType).toBe('audio/webm')

    const updatedProject = projectRepository.findById(project.id)
    expect(updatedProject?.status).toBe('COMPLETED')
    expect(updatedProject?.durationMs).toBeGreaterThanOrEqual(0)
    expect(updatedProject?.startedAt).not.toBeNull()
    expect(updatedProject?.endedAt).not.toBeNull()

    const filePath = join(
      libraryRoot,
      'projects',
      project.id,
      'source',
      'microphone',
      'microphone_000001.webm'
    )
    const fileContent = await readFile(filePath)
    expect(fileContent).toEqual(Buffer.from([1, 2, 3, 4, 5, 6]))

    const manifestPath = join(libraryRoot, 'projects', project.id, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
      status: string
      tracks: Array<{ segments: Array<{ finalized: boolean; byteSize: number }> }>
    }
    expect(manifest.status).toBe('COMPLETED')
    expect(manifest.tracks[0]?.segments[0]?.finalized).toBe(true)
    expect(manifest.tracks[0]?.segments[0]?.byteSize).toBe(6)
  })

  it('records microphone and camera simultaneously as independent tracks/files', async () => {
    const project = createProject()
    const { tracks } = await manager.start(project.id, ['MICROPHONE', 'CAMERA'])
    expect(tracks).toHaveLength(2)
    const microphoneTrackId = findTrack(tracks, 'MICROPHONE')
    const cameraTrackId = findTrack(tracks, 'CAMERA')
    expect(microphoneTrackId).not.toBe(cameraTrackId)

    await manager.appendChunk(microphoneTrackId, 0, 'audio/webm', new Uint8Array([1, 1, 1]))
    await manager.appendChunk(cameraTrackId, 0, 'video/webm', new Uint8Array([2, 2]))
    await manager.appendChunk(microphoneTrackId, 1, 'audio/webm', new Uint8Array([1]))

    await manager.stop(project.id)

    const micFile = await readFile(
      join(libraryRoot, 'projects', project.id, 'source', 'microphone', 'microphone_000001.webm')
    )
    expect(micFile).toEqual(Buffer.from([1, 1, 1, 1]))

    const cameraFile = await readFile(
      join(libraryRoot, 'projects', project.id, 'source', 'camera', 'camera_000001.webm')
    )
    expect(cameraFile).toEqual(Buffer.from([2, 2]))

    const micSegments = segmentRepository.listByTrack(microphoneTrackId)
    const cameraSegments = segmentRepository.listByTrack(cameraTrackId)
    expect(micSegments[0]?.mimeType).toBe('audio/webm')
    expect(cameraSegments[0]?.mimeType).toBe('video/webm')
    expect(micSegments[0]?.finalized).toBe(true)
    expect(cameraSegments[0]?.finalized).toBe(true)

    const manifestPath = join(libraryRoot, 'projects', project.id, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
      tracks: Array<{ type: string }>
    }
    expect(manifest.tracks.map((track) => track.type).sort()).toEqual(['camera', 'microphone'])
  })

  it('records microphone, camera and screen simultaneously as three independent tracks/files', async () => {
    const project = createProject()
    const { tracks } = await manager.start(project.id, ['MICROPHONE', 'CAMERA', 'SCREEN'])
    expect(tracks).toHaveLength(3)
    const microphoneTrackId = findTrack(tracks, 'MICROPHONE')
    const cameraTrackId = findTrack(tracks, 'CAMERA')
    const screenTrackId = findTrack(tracks, 'SCREEN')
    expect(new Set([microphoneTrackId, cameraTrackId, screenTrackId]).size).toBe(3)

    await manager.appendChunk(microphoneTrackId, 0, 'audio/webm', new Uint8Array([1]))
    await manager.appendChunk(cameraTrackId, 0, 'video/webm', new Uint8Array([2, 2]))
    await manager.appendChunk(screenTrackId, 0, 'video/webm', new Uint8Array([3, 3, 3]))

    await manager.stop(project.id)

    const screenFile = await readFile(
      join(libraryRoot, 'projects', project.id, 'source', 'screen', 'screen_000001.webm')
    )
    expect(screenFile).toEqual(Buffer.from([3, 3, 3]))

    const screenSegments = segmentRepository.listByTrack(screenTrackId)
    expect(screenSegments[0]?.finalized).toBe(true)
    expect(screenSegments[0]?.byteSize).toBe(3)

    const manifestPath = join(libraryRoot, 'projects', project.id, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
      tracks: Array<{ type: string }>
    }
    expect(manifest.tracks.map((track) => track.type).sort()).toEqual([
      'camera',
      'microphone',
      'screen'
    ])
  })

  it('rejects appendChunk for a mismatched trackId', async () => {
    const project = createProject()
    await manager.start(project.id, ['MICROPHONE'])
    await expect(
      manager.appendChunk(randomUUID(), 0, 'audio/webm', new Uint8Array([1]))
    ).rejects.toThrow()
  })

  it('rejects starting a second recording while one is already active', async () => {
    const first = createProject()
    await manager.start(first.id, ['MICROPHONE'])
    const second = createProject()
    await expect(manager.start(second.id, ['MICROPHONE'])).rejects.toThrow('em andamento')
  })

  it('rejects stop when there is no active session for the project', async () => {
    const project = createProject()
    await expect(manager.stop(project.id)).rejects.toThrow()
  })

  it('drops out-of-order/duplicate chunks without corrupting the file', async () => {
    const project = createProject()
    const { tracks } = await manager.start(project.id, ['MICROPHONE'])
    const microphoneTrackId = findTrack(tracks, 'MICROPHONE')

    await manager.appendChunk(microphoneTrackId, 0, 'audio/webm', new Uint8Array([1, 1]))
    const duplicate = await manager.appendChunk(
      microphoneTrackId,
      0,
      'audio/webm',
      new Uint8Array([9, 9])
    )
    expect(duplicate.receivedBytes).toBe(0)

    await manager.stop(project.id)

    const filePath = join(
      libraryRoot,
      'projects',
      project.id,
      'source',
      'microphone',
      'microphone_000001.webm'
    )
    const fileContent = await readFile(filePath)
    expect(fileContent).toEqual(Buffer.from([1, 1]))
  })

  it('allows a new recording after the previous one completes', async () => {
    const first = createProject()
    await manager.start(first.id, ['MICROPHONE'])
    await manager.stop(first.id)

    const second = createProject()
    const { state } = await manager.start(second.id, ['MICROPHONE'])
    expect(state).toBe('RECORDING')
  })
})
