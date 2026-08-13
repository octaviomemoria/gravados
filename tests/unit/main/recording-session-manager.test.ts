import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
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
import type { DatabaseClient } from '../../../src/main/database/client'
import type { RecordingTrackHandle } from '../../../src/shared/schemas/recording.schema'

describe('RecordingSessionManager', () => {
  let client: DatabaseClient
  let libraryRoot: string
  let manager: RecordingSessionManager
  let projectRepository: ProjectRepository
  let segmentRepository: SegmentRepository
  let markerRepository: MarkerRepository

  beforeEach(async () => {
    client = createTestDatabase()
    libraryRoot = await mkdtemp(join(tmpdir(), 'meeting-studio-rec-test-'))
    projectRepository = new ProjectRepository(client.db)
    const trackRepository = new TrackRepository(client.db)
    segmentRepository = new SegmentRepository(client.db)
    markerRepository = new MarkerRepository(client.db)
    manager = new RecordingSessionManager(
      projectRepository,
      trackRepository,
      segmentRepository,
      markerRepository,
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
      1,
      0,
      'audio/webm',
      new Uint8Array([1, 2, 3, 4])
    )
    expect(result1).toEqual({ receivedBytes: 4, totalBytes: 4 })

    const result2 = await manager.appendChunk(
      microphoneTrackId,
      1,
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

    await manager.appendChunk(microphoneTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 1, 1]))
    await manager.appendChunk(cameraTrackId, 1, 0, 'video/webm', new Uint8Array([2, 2]))
    await manager.appendChunk(microphoneTrackId, 1, 1, 'audio/webm', new Uint8Array([1]))

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

    await manager.appendChunk(microphoneTrackId, 1, 0, 'audio/webm', new Uint8Array([1]))
    await manager.appendChunk(cameraTrackId, 1, 0, 'video/webm', new Uint8Array([2, 2]))
    await manager.appendChunk(screenTrackId, 1, 0, 'video/webm', new Uint8Array([3, 3, 3]))

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

  it('records microphone, camera, screen and system audio simultaneously as four independent tracks/files', async () => {
    const project = createProject()
    const { tracks } = await manager.start(project.id, [
      'MICROPHONE',
      'CAMERA',
      'SCREEN',
      'SYSTEM_AUDIO'
    ])
    expect(tracks).toHaveLength(4)
    const microphoneTrackId = findTrack(tracks, 'MICROPHONE')
    const cameraTrackId = findTrack(tracks, 'CAMERA')
    const screenTrackId = findTrack(tracks, 'SCREEN')
    const systemAudioTrackId = findTrack(tracks, 'SYSTEM_AUDIO')
    expect(
      new Set([microphoneTrackId, cameraTrackId, screenTrackId, systemAudioTrackId]).size
    ).toBe(4)

    await manager.appendChunk(microphoneTrackId, 1, 0, 'audio/webm', new Uint8Array([1]))
    await manager.appendChunk(cameraTrackId, 1, 0, 'video/webm', new Uint8Array([2, 2]))
    await manager.appendChunk(screenTrackId, 1, 0, 'video/webm', new Uint8Array([3, 3, 3]))
    await manager.appendChunk(systemAudioTrackId, 1, 0, 'audio/webm', new Uint8Array([4, 4, 4, 4]))

    await manager.stop(project.id)

    const systemAudioFile = await readFile(
      join(libraryRoot, 'projects', project.id, 'source', 'system-audio', 'system-audio_000001.webm')
    )
    expect(systemAudioFile).toEqual(Buffer.from([4, 4, 4, 4]))

    const systemAudioSegments = segmentRepository.listByTrack(systemAudioTrackId)
    expect(systemAudioSegments[0]?.finalized).toBe(true)
    expect(systemAudioSegments[0]?.byteSize).toBe(4)

    const manifestPath = join(libraryRoot, 'projects', project.id, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
      tracks: Array<{ type: string }>
    }
    expect(manifest.tracks.map((track) => track.type).sort()).toEqual([
      'camera',
      'microphone',
      'screen',
      'system_audio'
    ])
  })

  it('gracefully finalizes a track that never received any chunk (RF-005: system audio unsupported on this platform)', async () => {
    const project = createProject()
    const { tracks } = await manager.start(project.id, ['MICROPHONE', 'SYSTEM_AUDIO'])
    const microphoneTrackId = findTrack(tracks, 'MICROPHONE')
    const systemAudioTrackId = findTrack(tracks, 'SYSTEM_AUDIO')

    // Simula o renderer nao conseguindo adquirir a stream de audio do sistema (RF-005) - so a
    // trilha de microfone recebe chunks, a de audio do sistema fica sem nenhum.
    await manager.appendChunk(microphoneTrackId, 1, 0, 'audio/webm', new Uint8Array([7, 7]))

    const stopResult = await manager.stop(project.id)
    expect(stopResult.state).toBe('COMPLETED')
    expect(manager.getState()).toBe('IDLE')

    const systemAudioSegments = segmentRepository.listByTrack(systemAudioTrackId)
    expect(systemAudioSegments).toHaveLength(0)

    const manifestPath = join(libraryRoot, 'projects', project.id, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
      status: string
      tracks: Array<{ type: string; segments: unknown[] }>
    }
    expect(manifest.status).toBe('COMPLETED')
    const systemAudioManifestTrack = manifest.tracks.find((track) => track.type === 'system_audio')
    expect(systemAudioManifestTrack?.segments).toEqual([])
  })

  it('rejects appendChunk for a mismatched trackId', async () => {
    const project = createProject()
    await manager.start(project.id, ['MICROPHONE'])
    await expect(
      manager.appendChunk(randomUUID(), 1, 0, 'audio/webm', new Uint8Array([1]))
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

    await manager.appendChunk(microphoneTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 1]))
    const duplicate = await manager.appendChunk(
      microphoneTrackId,
      1,
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

  // RF-012/RF-013 (sexto incremento - segmentacao por tempo/tamanho): o renderer sinaliza a
  // rotacao simplesmente enviando um `segmentIndex` maior no proximo chunk - estes testes cobrem
  // a reacao do manager a essa mudanca de indice, sem depender de nenhum timer real.
  describe('segmentacao (rotacao de segmentos)', () => {
    it('rotates to a new segment mid-session and finalizes the previous one immediately (not only at stop)', async () => {
      const project = createProject()
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const microphoneTrackId = findTrack(tracks, 'MICROPHONE')

      await manager.appendChunk(microphoneTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 1]))
      await manager.appendChunk(microphoneTrackId, 1, 1, 'audio/webm', new Uint8Array([2, 2]))
      // Rotaciona: segmentIndex sobe para 2, sequence reinicia em 0 (segmento novo).
      const rotateResult = await manager.appendChunk(
        microphoneTrackId,
        2,
        0,
        'audio/webm',
        new Uint8Array([3, 3, 3])
      )
      expect(rotateResult).toEqual({ receivedBytes: 3, totalBytes: 3 })

      // O primeiro segmento ja deve estar finalizado ANTES de stop() ser chamado.
      const segmentsBeforeStop = segmentRepository.listByTrack(microphoneTrackId)
      expect(segmentsBeforeStop).toHaveLength(2)
      const firstSegment = segmentsBeforeStop.find((segment) => segment.seqIndex === 1)
      expect(firstSegment?.finalized).toBe(true)
      expect(firstSegment?.byteSize).toBe(4)
      expect(firstSegment?.endedAtMs).not.toBeNull()
      const secondSegment = segmentsBeforeStop.find((segment) => segment.seqIndex === 2)
      expect(secondSegment?.finalized).toBe(false)

      await manager.stop(project.id)

      const firstFile = await readFile(
        join(libraryRoot, 'projects', project.id, 'source', 'microphone', 'microphone_000001.webm')
      )
      expect(firstFile).toEqual(Buffer.from([1, 1, 2, 2]))
      const secondFile = await readFile(
        join(libraryRoot, 'projects', project.id, 'source', 'microphone', 'microphone_000002.webm')
      )
      expect(secondFile).toEqual(Buffer.from([3, 3, 3]))
    })

    it('writes a manifest with multiple segments per track, each with its own byteSize, after rotation and stop', async () => {
      const project = createProject()
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const microphoneTrackId = findTrack(tracks, 'MICROPHONE')

      await manager.appendChunk(microphoneTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 1]))
      await manager.appendChunk(microphoneTrackId, 2, 0, 'audio/webm', new Uint8Array([2, 2, 2]))
      await manager.stop(project.id)

      const manifestPath = join(libraryRoot, 'projects', project.id, 'manifest.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
        tracks: Array<{ segments: Array<{ index: number; byteSize: number; finalized: boolean }> }>
      }
      const segments = manifest.tracks[0]?.segments ?? []
      expect(segments).toHaveLength(2)
      expect(segments[0]).toMatchObject({ index: 1, byteSize: 2, finalized: true })
      expect(segments[1]).toMatchObject({ index: 2, byteSize: 3, finalized: true })
    })

    it('drops a chunk tagged with an already-rotated-away segmentIndex without corrupting the current file', async () => {
      const project = createProject()
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const microphoneTrackId = findTrack(tracks, 'MICROPHONE')

      await manager.appendChunk(microphoneTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 1]))
      await manager.appendChunk(microphoneTrackId, 2, 0, 'audio/webm', new Uint8Array([2, 2, 2]))
      // Chunk atrasado do segmento 1, que ja foi rotacionado/finalizado - deve ser descartado.
      const stale = await manager.appendChunk(
        microphoneTrackId,
        1,
        1,
        'audio/webm',
        new Uint8Array([9, 9])
      )
      expect(stale.receivedBytes).toBe(0)

      await manager.stop(project.id)

      const firstFile = await readFile(
        join(libraryRoot, 'projects', project.id, 'source', 'microphone', 'microphone_000001.webm')
      )
      expect(firstFile).toEqual(Buffer.from([1, 1]))
    })

    it('rejects a late appendChunk queued right after stop() begins, without corrupting the finalized file', async () => {
      const project = createProject()
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const microphoneTrackId = findTrack(tracks, 'MICROPHONE')
      await manager.appendChunk(microphoneTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 1]))

      // stop() e chamado primeiro (entra no mutex da trilha primeiro); o appendChunk seguinte,
      // mesmo chamado logo em seguida sem esperar, so roda DEPOIS - deve ver a trilha ja marcada
      // como `stopped` e rejeitar, em vez de reabrir um segmento numa gravacao ja finalizada
      // (regressao para o bug de concorrencia corrigido neste incremento).
      const stopPromise = manager.stop(project.id)
      const latePromise = manager.appendChunk(
        microphoneTrackId,
        1,
        1,
        'audio/webm',
        new Uint8Array([9, 9])
      )
      // Anexado SINCRONAMENTE (sem `await` entre a criacao de `latePromise` e esta linha) - a
      // rejeicao so acontece depois de pelo menos um microtask (a promise so roda quando o mutex
      // da trilha resolve), mas se o handler for anexado so depois de outro `await` (ex.:
      // aguardando `stopPromise` primeiro), a rejeicao pode disparar ANTES do handler existir,
      // gerando um "unhandled rejection" que o Vitest reporta como erro mesmo com a asserção
      // eventualmente passando.
      const lateRejection = expect(latePromise).rejects.toThrow()

      await expect(stopPromise).resolves.toMatchObject({ state: 'COMPLETED' })
      await lateRejection

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
  })

  // RF-010 (setimo incremento - pausar/retomar). Diferente da segmentacao, pausar/retomar nao
  // toca em nenhum arquivo/segmento - so a maquina de estados e o registro de pauseIntervals no
  // manifest. `MediaRecorder.pause()`/`.resume()` (chamados pelo renderer, nao testados aqui - ver
  // `tests/e2e/recording.spec.ts`) sao o que de fato suspende a captura.
  describe('pausar/retomar', () => {
    it('pauses an active recording, transitioning RECORDING -> PAUSED and recording an open pause interval', async () => {
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])

      const pauseResult = await manager.pause(project.id)
      expect(pauseResult.state).toBe('PAUSED')
      expect(manager.getState()).toBe('PAUSED')

      const manifestPath = join(libraryRoot, 'projects', project.id, 'manifest.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
        status: string
        pauseIntervals: Array<{ pausedAtMs: number; resumedAtMs: number | null }>
      }
      expect(manifest.status).toBe('PAUSED')
      expect(manifest.pauseIntervals).toHaveLength(1)
      expect(manifest.pauseIntervals[0]?.resumedAtMs).toBeNull()
    })

    it('resumes a paused recording, transitioning PAUSED -> RECORDING and closing the open pause interval', async () => {
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])
      await manager.pause(project.id)

      const resumeResult = await manager.resume(project.id)
      expect(resumeResult.state).toBe('RECORDING')
      expect(manager.getState()).toBe('RECORDING')

      const manifestPath = join(libraryRoot, 'projects', project.id, 'manifest.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
        pauseIntervals: Array<{ pausedAtMs: number; resumedAtMs: number | null }>
      }
      expect(manifest.pauseIntervals).toHaveLength(1)
      expect(manifest.pauseIntervals[0]?.resumedAtMs).not.toBeNull()
    })

    it('allows appendChunk to continue writing to the same segment after a pause/resume cycle (no new file)', async () => {
      const project = createProject()
      const { tracks } = await manager.start(project.id, ['MICROPHONE'])
      const microphoneTrackId = findTrack(tracks, 'MICROPHONE')

      await manager.appendChunk(microphoneTrackId, 1, 0, 'audio/webm', new Uint8Array([1, 1]))
      await manager.pause(project.id)
      await manager.resume(project.id)
      // Mesmo segmento (indice 1) - pausar/retomar nunca fecha/abre arquivo, so a maquina de
      // estados; o chunk seguinte continua no MESMO segmento normalmente.
      await manager.appendChunk(microphoneTrackId, 1, 1, 'audio/webm', new Uint8Array([2, 2]))

      await manager.stop(project.id)

      const segments = segmentRepository.listByTrack(microphoneTrackId)
      expect(segments).toHaveLength(1)
      const filePath = join(
        libraryRoot,
        'projects',
        project.id,
        'source',
        'microphone',
        'microphone_000001.webm'
      )
      const fileContent = await readFile(filePath)
      expect(fileContent).toEqual(Buffer.from([1, 1, 2, 2]))
    })

    it('records multiple closed pause intervals across repeated pause/resume cycles', async () => {
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])

      await manager.pause(project.id)
      await manager.resume(project.id)
      await manager.pause(project.id)
      await manager.resume(project.id)

      const manifestPath = join(libraryRoot, 'projects', project.id, 'manifest.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
        pauseIntervals: Array<{ pausedAtMs: number; resumedAtMs: number | null }>
      }
      expect(manifest.pauseIntervals).toHaveLength(2)
      expect(manifest.pauseIntervals.every((interval) => interval.resumedAtMs !== null)).toBe(true)
    })

    it('allows stop() while paused, leaving the trailing pause interval open in the manifest', async () => {
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])
      await manager.pause(project.id)

      const stopResult = await manager.stop(project.id)
      expect(stopResult.state).toBe('COMPLETED')

      const manifestPath = join(libraryRoot, 'projects', project.id, 'manifest.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
        status: string
        pauseIntervals: Array<{ pausedAtMs: number; resumedAtMs: number | null }>
      }
      expect(manifest.status).toBe('COMPLETED')
      expect(manifest.pauseIntervals).toHaveLength(1)
      expect(manifest.pauseIntervals[0]?.resumedAtMs).toBeNull()
    })

    it('rejects pause() when there is no active recording for the project', async () => {
      const project = createProject()
      await expect(manager.pause(project.id)).rejects.toThrow()
    })

    it('rejects pause() when the recording is already paused (invalid state transition)', async () => {
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])
      await manager.pause(project.id)
      await expect(manager.pause(project.id)).rejects.toThrow()
    })

    it('rejects resume() when the recording is not paused (invalid state transition)', async () => {
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])
      await expect(manager.resume(project.id)).rejects.toThrow()
    })

    it('rejects pause()/resume() for a mismatched projectId', async () => {
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])
      await expect(manager.pause(randomUUID())).rejects.toThrow()
      await expect(manager.resume(randomUUID())).rejects.toThrow()
    })
  })

  describe('marcadores', () => {
    afterEach(() => {
      // So afeta os testes deste describe que optam por `vi.useFakeTimers()` (para controlar
      // `Date.now()` de forma deterministica no calculo de `timestampMs`) - inofensivo/no-op nos
      // demais, que continuam usando o tempo real.
      vi.useRealTimers()
    })

    it('records a marker with timestampMs relative to the recording start (recorded time, not wall time)', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(0)
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])

      vi.setSystemTime(5_000)
      const marker = await manager.addMarker(project.id)

      expect(marker.timestampMs).toBe(5_000)
      expect(marker.projectId).toBe(project.id)
      expect(marker.title).toBeNull()
      expect(marker.note).toBeNull()
    })

    it('stores optional title/note when provided', async () => {
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])

      const marker = await manager.addMarker(project.id, 'Decisao importante', 'Revisar depois')

      expect(marker.title).toBe('Decisao importante')
      expect(marker.note).toBe('Revisar depois')
    })

    it('discounts closed pause intervals from timestampMs (counts recorded time, not wall time)', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(0)
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])

      vi.setSystemTime(2_000)
      await manager.pause(project.id)
      vi.setSystemTime(12_000) // 10s de pausa - nao deve contar no timestamp do marcador.
      await manager.resume(project.id)
      vi.setSystemTime(13_000)

      const marker = await manager.addMarker(project.id)

      // 2s antes da pausa + 1s depois de retomar = 3s de tempo GRAVADO, descontando os 10s pausados.
      expect(marker.timestampMs).toBe(3_000)
    })

    it('persists the marker via MarkerRepository, retrievable through listMarkers()', async () => {
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])

      await manager.addMarker(project.id, 'Primeiro')
      await manager.addMarker(project.id, 'Segundo')

      const markers = manager.listMarkers(project.id)
      expect(markers).toHaveLength(2)
      expect(markers.map((marker) => marker.title)).toEqual(['Primeiro', 'Segundo'])
      // Mesma fonte de verdade que `MarkerRepository.listByProject` usa diretamente.
      expect(markerRepository.listByProject(project.id)).toHaveLength(2)
    })

    it('rejects addMarker() while paused (no clear "current instant" to mark)', async () => {
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])
      await manager.pause(project.id)

      await expect(manager.addMarker(project.id)).rejects.toThrow()
    })

    it('rejects addMarker() when there is no active recording for the project', async () => {
      const project = createProject()
      await expect(manager.addMarker(project.id)).rejects.toThrow()
    })

    it('rejects addMarker() for a mismatched projectId', async () => {
      const project = createProject()
      await manager.start(project.id, ['MICROPHONE'])
      await expect(manager.addMarker(randomUUID())).rejects.toThrow()
    })
  })
})
