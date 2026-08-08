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
  type ProjectManifest
} from '../media/project-filesystem'
import { SOURCE_ROOT_FOLDER_NAME } from '../../shared/constants/filesystem'
import { MANIFEST_SCHEMA_VERSION } from '../../shared/constants/app-info'
import { ValidationError, MediaFinalizeError, NotFoundError } from '../../shared/types/domain-errors'
import type { RecordingState } from '../../shared/types/recording-state'
import { createScopedLogger } from '../services/logger'

const logger = createScopedLogger('recording-session')

/** RF-002..RF-016 (primeiro incremento - somente microfone, ver README "Decisoes de arquitetura"). */
const MICROPHONE_SOURCE_NAME = 'microphone'

interface ActiveSession {
  projectId: string
  microphoneTrackId: string
  paths: ProjectPaths
  startedAtMs: number
  segment: {
    id: string
    relativePath: string
    fileHandle: FileHandle
    byteSize: number
    mimeType: string
    lastSequence: number
  } | null
}

export interface StartRecordingResult {
  state: RecordingState
  microphoneTrackId: string
}

export interface AppendChunkResult {
  receivedBytes: number
  totalBytes: number
}

/**
 * Orquestra UMA sessao de gravacao ativa por vez (RF-009/RF-011/RF-014/RF-016). Cada chunk
 * recebido do MediaRecorder do renderer e escrito no arquivo imediatamente - nunca acumulado em
 * memoria (RF-014). O arquivo/registro de segmento so e criado no PRIMEIRO chunk, quando o
 * `mimeType` real (definido pelo `MediaRecorder` do renderer) e conhecido.
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

  async start(projectId: string): Promise<StartRecordingResult> {
    if (this.activeSession) {
      throw new ValidationError('Ja existe uma gravacao em andamento.')
    }

    const project = this.projectRepository.findById(projectId)
    if (!project) {
      throw new NotFoundError(`Projeto nao encontrado: ${projectId}`)
    }

    this.stateMachine.transitionTo('PREPARING')

    try {
      const paths = buildProjectPaths(this.libraryRootPath, projectId)
      await createProjectDirectoryTree(paths)

      const microphoneTrackId = randomUUID()
      this.trackRepository.create({
        id: microphoneTrackId,
        projectId,
        type: 'MICROPHONE',
        enabled: true,
        position: 0,
        startOffsetMs: 0
      })

      const startedAtMs = Date.now()
      this.activeSession = { projectId, microphoneTrackId, paths, startedAtMs, segment: null }

      this.stateMachine.transitionTo('RECORDING')
      this.projectRepository.updateRecordingLifecycle(projectId, {
        status: 'RECORDING',
        startedAt: new Date(startedAtMs).toISOString()
      })

      await this.writeManifest('RECORDING', startedAtMs)

      logger.info('Gravacao iniciada', {
        projectId,
        trackId: microphoneTrackId,
        operation: 'recording.start'
      })
      return { state: this.stateMachine.getState(), microphoneTrackId }
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
    if (!session || session.microphoneTrackId !== trackId) {
      throw new ValidationError('Nenhuma gravacao ativa corresponde a esta trilha.')
    }

    if (!session.segment) {
      const fileName = buildSegmentFileName(MICROPHONE_SOURCE_NAME, 1)
      const relativePath = join(SOURCE_ROOT_FOLDER_NAME, MICROPHONE_SOURCE_NAME, fileName)
      const absolutePath = join(session.paths.sourceMicrophonePath, fileName)
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

      session.segment = { id: segmentId, relativePath, fileHandle, byteSize: 0, mimeType, lastSequence: -1 }
    }

    if (sequence <= session.segment.lastSequence) {
      // Chunk fora de ordem/duplicado (reenvio) - ignorado para nao corromper o arquivo.
      logger.warn('Chunk fora de ordem ignorado', {
        trackId,
        operation: 'recording.appendChunk'
      })
      return { receivedBytes: 0, totalBytes: session.segment.byteSize }
    }

    await session.segment.fileHandle.write(data)
    session.segment.byteSize += data.byteLength
    session.segment.lastSequence = sequence

    return { receivedBytes: data.byteLength, totalBytes: session.segment.byteSize }
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

    if (session.segment) {
      try {
        await session.segment.fileHandle.sync()
        await session.segment.fileHandle.close()
      } catch (error) {
        this.stateMachine.transitionTo('FAILED')
        // Libera a sessao mesmo em falha - senao o gerenciador fica preso achando que uma
        // gravacao (quebrada) ainda esta ativa, impedindo qualquer nova tentativa.
        this.activeSession = null
        this.stateMachine.reset()
        throw new MediaFinalizeError('Falha ao finalizar o arquivo de audio gravado.', {
          projectId,
          errorName: error instanceof Error ? error.name : 'UNKNOWN'
        })
      }
      this.segmentRepository.markFinalized(
        session.segment.id,
        endedAtMs,
        endedAtMs - session.startedAtMs,
        session.segment.byteSize
      )
    }

    this.projectRepository.updateRecordingLifecycle(projectId, {
      status: 'COMPLETED',
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs
    })

    await this.writeManifest('COMPLETED', session.startedAtMs, {
      endedAtMs,
      segment: session.segment
    })

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
    finalized?: { endedAtMs: number; segment: ActiveSession['segment'] }
  ): Promise<void> {
    const session = this.activeSession
    if (!session) return

    const manifest: ProjectManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      projectId: session.projectId,
      status,
      startedAt: new Date(startedAtMs).toISOString(),
      tracks: [
        {
          id: session.microphoneTrackId,
          type: 'microphone',
          segments: session.segment
            ? [
                {
                  index: 1,
                  relativePath: session.segment.relativePath,
                  startedAtMs,
                  endedAtMs: finalized?.endedAtMs ?? null,
                  byteSize: session.segment.byteSize,
                  finalized: Boolean(finalized)
                }
              ]
            : []
        }
      ]
    }

    await writeManifestAtomic(session.paths.manifestPath, manifest)
  }
}
