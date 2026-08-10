import { open, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { TrackRepository } from '../database/repositories/track.repository'
import type { SegmentRepository } from '../database/repositories/segment.repository'
import { RecordingStateMachine } from './recording-state-machine'
import {
  buildProjectPaths,
  buildSegmentFileName,
  createProjectDirectoryTree,
  writeManifestAtomic,
  type ProjectPaths,
  type ProjectManifest,
  type ManifestTrack,
  type ManifestTrackType
} from '../media/project-filesystem'
import { SOURCE_ROOT_FOLDER_NAME } from '../../shared/constants/filesystem'
import { MANIFEST_SCHEMA_VERSION } from '../../shared/constants/app-info'
import { ValidationError, MediaFinalizeError, NotFoundError } from '../../shared/types/domain-errors'
import type { RecordingState } from '../../shared/types/recording-state'
import type { RecordingTrackType, RecordingTrackHandle } from '../../shared/schemas/recording.schema'
import { createScopedLogger } from '../services/logger'

const logger = createScopedLogger('recording-session')

/**
 * RF-002/RF-005/RF-006/RF-007 (quinto incremento - microfone + camera + tela + audio do sistema
 * simultaneos, ver README "Decisoes de arquitetura"). Mapeia cada tipo de trilha suportado para
 * sua pasta/nome de fonte - o main nao sabe (nem precisa saber) COMO o renderer obteve a stream de
 * cada tipo (getUserMedia simples para mic/camera, `chromeMediaSourceId`/`chromeMediaSource:
 * 'desktop'` para tela/audio do sistema); so recebe chunks ja marcados com o `trackId` correto. Se
 * o renderer nunca enviar nenhum chunk para uma trilha (RF-005: audio do sistema so "quando
 * suportado pela plataforma" - ver `useRecordingSession.ts`), `stop()` finaliza a sessao
 * normalmente e essa trilha fica apenas sem segmento (ver teste "gracefully finalizes a track that
 * never received any chunk").
 */
const TRACK_TYPE_INFO: Record<
  RecordingTrackType,
  { manifestType: ManifestTrackType; sourceName: string; getSourcePath: (paths: ProjectPaths) => string }
> = {
  MICROPHONE: {
    manifestType: 'microphone',
    sourceName: 'microphone',
    getSourcePath: (paths) => paths.sourceMicrophonePath
  },
  CAMERA: {
    manifestType: 'camera',
    sourceName: 'camera',
    getSourcePath: (paths) => paths.sourceCameraPath
  },
  SCREEN: {
    manifestType: 'screen',
    sourceName: 'screen',
    getSourcePath: (paths) => paths.sourceScreenPath
  },
  SYSTEM_AUDIO: {
    manifestType: 'system_audio',
    sourceName: 'system-audio',
    getSourcePath: (paths) => paths.sourceSystemAudioPath
  }
}

interface TrackSegmentState {
  id: string
  relativePath: string
  fileHandle: FileHandle
  byteSize: number
  mimeType: string
  lastSequence: number
}

interface TrackSessionState {
  trackId: string
  type: RecordingTrackType
  segment: TrackSegmentState | null
}

interface ActiveSession {
  projectId: string
  paths: ProjectPaths
  startedAtMs: number
  tracks: Map<string, TrackSessionState>
}

export interface StartRecordingResult {
  state: RecordingState
  tracks: RecordingTrackHandle[]
}

export interface AppendChunkResult {
  receivedBytes: number
  totalBytes: number
}

/**
 * Orquestra UMA sessao de gravacao ativa por vez, com N trilhas simultaneas (RF-006/RF-007/
 * RF-009/RF-011/RF-014/RF-016). Cada chunk recebido do MediaRecorder do renderer e escrito no
 * arquivo da SUA trilha imediatamente - nunca acumulado em memoria (RF-014). O arquivo/registro
 * de segmento de cada trilha so e criado no PRIMEIRO chunk dela, quando o `mimeType` real
 * (definido pelo `MediaRecorder` do renderer) e conhecido.
 */
export class RecordingSessionManager {
  private activeSession: ActiveSession | null = null

  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly trackRepository: TrackRepository,
    private readonly segmentRepository: SegmentRepository,
    private readonly stateMachine: RecordingStateMachine,
    private readonly libraryRootPath: string
  ) {}

  getState(): RecordingState {
    return this.stateMachine.getState()
  }

  async start(projectId: string, trackTypes: RecordingTrackType[]): Promise<StartRecordingResult> {
    if (this.activeSession) {
      throw new ValidationError('Ja existe uma gravacao em andamento.')
    }
    if (trackTypes.length === 0) {
      throw new ValidationError('Selecione ao menos uma fonte para gravar.')
    }

    const project = this.projectRepository.findById(projectId)
    if (!project) {
      throw new NotFoundError(`Projeto nao encontrado: ${projectId}`)
    }

    this.stateMachine.transitionTo('PREPARING')

    try {
      const paths = buildProjectPaths(this.libraryRootPath, projectId)
      await createProjectDirectoryTree(paths)

      const tracks = new Map<string, TrackSessionState>()
      const trackHandles: RecordingTrackHandle[] = []

      trackTypes.forEach((type, index) => {
        const trackId = randomUUID()
        this.trackRepository.create({
          id: trackId,
          projectId,
          type,
          enabled: true,
          position: index,
          startOffsetMs: 0
        })
        tracks.set(trackId, { trackId, type, segment: null })
        trackHandles.push({ trackId, type })
      })

      const startedAtMs = Date.now()
      this.activeSession = { projectId, paths, startedAtMs, tracks }

      this.stateMachine.transitionTo('RECORDING')
      this.projectRepository.updateRecordingLifecycle(projectId, {
        status: 'RECORDING',
        startedAt: new Date(startedAtMs).toISOString()
      })

      await this.writeManifest('RECORDING', startedAtMs)

      logger.info('Gravacao iniciada', { projectId, operation: 'recording.start' })
      return { state: this.stateMachine.getState(), tracks: trackHandles }
    } catch (error) {
      // Nunca deixar o gerenciador preso em PREPARING sem sessao ativa - uma falha aqui deve
      // sempre permitir uma nova tentativa (AGENTS.md: priorize confiabilidade/recuperacao).
      this.activeSession = null
      this.stateMachine.reset()
      throw error
    }
  }

  async appendChunk(
    trackId: string,
    sequence: number,
    mimeType: string,
    data: Uint8Array
  ): Promise<AppendChunkResult> {
    const session = this.activeSession
    const track = session?.tracks.get(trackId)
    if (!session || !track) {
      throw new ValidationError('Nenhuma gravacao ativa corresponde a esta trilha.')
    }

    if (!track.segment) {
      const info = TRACK_TYPE_INFO[track.type]
      const fileName = buildSegmentFileName(info.sourceName, 1)
      const relativePath = join(SOURCE_ROOT_FOLDER_NAME, info.sourceName, fileName)
      const absolutePath = join(info.getSourcePath(session.paths), fileName)
      const fileHandle = await open(absolutePath, 'w')
      const segmentId = randomUUID()

      this.segmentRepository.create({
        id: segmentId,
        trackId,
        seqIndex: 1,
        relativePath,
        startedAtMs: session.startedAtMs,
        endedAtMs: null,
        durationMs: null,
        byteSize: 0,
        mimeType,
        finalized: false
      })

      track.segment = {
        id: segmentId,
        relativePath,
        fileHandle,
        byteSize: 0,
        mimeType,
        lastSequence: -1
      }
    }

    if (sequence <= track.segment.lastSequence) {
      // Chunk fora de ordem/duplicado (reenvio) - ignorado para nao corromper o arquivo.
      logger.warn('Chunk fora de ordem ignorado', { trackId, operation: 'recording.appendChunk' })
      return { receivedBytes: 0, totalBytes: track.segment.byteSize }
    }

    await track.segment.fileHandle.write(data)
    track.segment.byteSize += data.byteLength
    track.segment.lastSequence = sequence

    return { receivedBytes: data.byteLength, totalBytes: track.segment.byteSize }
  }

  async stop(projectId: string): Promise<{ state: RecordingState }> {
    const session = this.activeSession
    if (!session || session.projectId !== projectId) {
      throw new ValidationError('Nenhuma gravacao ativa para este projeto.')
    }

    this.stateMachine.transitionTo('STOPPING')
    this.stateMachine.transitionTo('FINALIZING')

    const endedAtMs = Date.now()
    const durationMs = endedAtMs - session.startedAtMs

    try {
      // Nota: se uma trilha falhar ao fechar no meio do loop, as trilhas seguintes nao sao
      // finalizadas (limitacao conhecida deste incremento) - mas a sessao SEMPRE e liberada no
      // catch abaixo, entao o app nunca fica preso sem poder iniciar uma nova gravacao.
      for (const track of session.tracks.values()) {
        if (!track.segment) continue
        await track.segment.fileHandle.sync()
        await track.segment.fileHandle.close()
        this.segmentRepository.markFinalized(
          track.segment.id,
          endedAtMs,
          endedAtMs - session.startedAtMs,
          track.segment.byteSize
        )
      }
    } catch (error) {
      this.stateMachine.transitionTo('FAILED')
      this.activeSession = null
      this.stateMachine.reset()
      throw new MediaFinalizeError('Falha ao finalizar a midia gravada.', {
        projectId,
        errorName: error instanceof Error ? error.name : 'UNKNOWN'
      })
    }

    this.projectRepository.updateRecordingLifecycle(projectId, {
      status: 'COMPLETED',
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs
    })

    await this.writeManifest('COMPLETED', session.startedAtMs, endedAtMs)

    this.stateMachine.transitionTo('COMPLETED')
    const finalState = this.stateMachine.getState()
    this.activeSession = null
    // COMPLETED e terminal no grafo de transicoes - reseta para IDLE para permitir uma nova
    // sessao, mas o estado retornado ao chamador e o COMPLETED capturado acima, nao o IDLE.
    this.stateMachine.reset()

    logger.info('Gravacao finalizada', { projectId, durationMs, operation: 'recording.stop' })
    return { state: finalState }
  }

  private async writeManifest(
    status: RecordingState,
    startedAtMs: number,
    endedAtMs?: number
  ): Promise<void> {
    const session = this.activeSession
    if (!session) return

    const tracks: ManifestTrack[] = Array.from(session.tracks.values()).map((track) => ({
      id: track.trackId,
      type: TRACK_TYPE_INFO[track.type].manifestType,
      segments: track.segment
        ? [
            {
              index: 1,
              relativePath: track.segment.relativePath,
              startedAtMs,
              endedAtMs: endedAtMs ?? null,
              byteSize: track.segment.byteSize,
              finalized: endedAtMs !== undefined
            }
          ]
        : []
    }))

    const manifest: ProjectManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      projectId: session.projectId,
      status,
      startedAt: new Date(startedAtMs).toISOString(),
      tracks
    }

    await writeManifestAtomic(session.paths.manifestPath, manifest)
  }
}
