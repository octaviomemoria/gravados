import { open, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { TrackRepository } from '../database/repositories/track.repository'
import type { SegmentRepository } from '../database/repositories/segment.repository'
import type { MarkerRepository } from '../database/repositories/marker.repository'
import type { MarkerEntity } from '../../shared/types/entities'
import { RecordingStateMachine } from './recording-state-machine'
import {
  projectPathsFromRoot,
  buildSegmentFileName,
  createProjectDirectoryTree,
  writeManifestAtomic,
  type ProjectPaths,
  type ProjectManifest,
  type ManifestTrack,
  type ManifestTrackType,
  type ManifestPauseInterval
} from '../media/project-filesystem'
import { SOURCE_ROOT_FOLDER_NAME } from '../../shared/constants/filesystem'
import { MANIFEST_SCHEMA_VERSION } from '../../shared/constants/app-info'
import { ValidationError, MediaFinalizeError, NotFoundError } from '../../shared/types/domain-errors'
import { assertMinimumDiskSpace } from '../services/disk-space.service'
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
  seqIndex: number
  relativePath: string
  fileHandle: FileHandle
  byteSize: number
  mimeType: string
  lastSequence: number
  startedAtMs: number
  endedAtMs: number | null
  finalized: boolean
}

interface TrackSessionState {
  trackId: string
  type: RecordingTrackType
  currentSegment: TrackSegmentState | null
  // RF-012/RF-013 (segmentacao): segmentos ja rotacionados/finalizados, acumulados em memoria para
  // montar o manifest com o historico completo. Consultar o banco a cada escrita do manifest nao
  // serviria - a linha do segmento em aberto so tem `byteSize` atualizado no banco quando finaliza
  // (`markFinalized`), entao apareceria sempre como 0 ate a proxima rotacao/stop.
  finalizedSegments: TrackSegmentState[]
  // Fecha a janela de corrida entre `stop()` e um `appendChunk` que ja estava enfileirado no mutex
  // desta trilha: marcado a true como a PRIMEIRA acao (antes de qualquer await) dentro do bloco
  // exclusivo de `stop()`, entao qualquer chamada de `appendChunk` que so ganha a vez depois nunca
  // reabre um segmento novo numa trilha que ja deveria estar finalizada.
  stopped: boolean
  // Serializa toda mutacao desta trilha (append normal, rotacao, finalizacao em stop) - sem isso,
  // uma rotacao concorrente com o proximo chunk (ou com `stop()`) poderia finalizar/abrir segmentos
  // fora de ordem.
  mutex: Promise<unknown>
}

interface ActiveSession {
  projectId: string
  paths: ProjectPaths
  startedAtMs: number
  tracks: Map<string, TrackSessionState>
  // RF-010 (setimo incremento - pausar/retomar). Pausa e uma acao de SESSAO inteira (todas as
  // trilhas pausam/retomam juntas, nao por trilha) - diferente de rotacao/finalizacao, que sao
  // por trilha. O ultimo item tem `resumedAtMs: null` enquanto a pausa atual esta em andamento.
  pauseIntervals: ManifestPauseInterval[]
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
 *
 * RF-012/RF-013 (sexto incremento - segmentacao por tempo/tamanho): o RENDERER decide quando
 * rotacionar (compara `totalBytes` devolvido por `appendChunk` contra `sizeSegmentationMb`, ou um
 * timer contra `timeSegmentationMinutes` - ver `useRecordingSession.ts`) e so sinaliza a decisao
 * enviando um `segmentIndex` maior no proximo chunk. O main reage a essa mudanca de indice: nao
 * existe um canal IPC dedicado para "rotacione agora" - a mesma logica de criacao preguicosa que
 * ja existia para o primeiro segmento e reaproveitada para qualquer segmento seguinte.
 */
export class RecordingSessionManager {
  private activeSession: ActiveSession | null = null
  // Serializa escritas do manifest entre si - trilhas diferentes podem rotacionar (e portanto
  // chamar `writeManifest`) concorrentemente; sem este mutex, a escrita atomica mais antiga
  // poderia terminar seu rename DEPOIS da mais nova, deixando o manifest.json com dados velhos.
  private manifestMutex: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly trackRepository: TrackRepository,
    private readonly segmentRepository: SegmentRepository,
    private readonly markerRepository: MarkerRepository,
    private readonly stateMachine: RecordingStateMachine,
    private readonly libraryRootPath: string
  ) {}

  getState(): RecordingState {
    return this.stateMachine.getState()
  }

  /**
   * RF-042 (nono incremento - monitor de espaco em disco). `minimumFreeBytes` e OPCIONAL e
   * deliberadamente nao lido internamente de `SettingsService` (o manager nao tem essa
   * dependencia) - quem chama (o handler IPC) resolve o valor configurado
   * (`recordingPresets.diskSpaceCriticalThresholdMb`) e passa aqui, mesmo espirito de "quem chama
   * decide o parametro, o manager so aplica" ja usado para `segmentIndex`. Omitir o parametro
   * (como todos os testes sinteticos existentes fazem) pula a checagem inteiramente - evita que
   * testes unitarios fiquem acoplados ao espaco real em disco da maquina que roda a suite.
   * "Evitar iniciar sessao quando nao houver margem minima configurada" (RF-042) - checado ANTES
   * de transicionar para PREPARING, entao uma rejeicao aqui nunca deixa a maquina de estados presa
   * nem cria a arvore de pastas do projeto.
   */
  async start(
    projectId: string,
    trackTypes: RecordingTrackType[],
    minimumFreeBytes?: number
  ): Promise<StartRecordingResult> {
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

    if (minimumFreeBytes !== undefined) {
      await assertMinimumDiskSpace(this.libraryRootPath, minimumFreeBytes)
    }

    this.stateMachine.transitionTo('PREPARING')

    try {
      // Usa o `rootPath` JA persistido no banco (gravado em `ProjectService.createProject`,
      // nomeado a partir do titulo - ver `buildProjectFolderName`) - nunca reconstroi o caminho a
      // partir so do `projectId`, o que apontaria pra uma pasta ERRADA/inexistente desde que o
      // nome da pasta passou a incluir o titulo.
      const paths = projectPathsFromRoot(project.rootPath)
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
        tracks.set(trackId, {
          trackId,
          type,
          currentSegment: null,
          finalizedSegments: [],
          stopped: false,
          mutex: Promise.resolve()
        })
        trackHandles.push({ trackId, type })
      })

      const startedAtMs = Date.now()
      this.activeSession = { projectId, paths, startedAtMs, tracks, pauseIntervals: [] }

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
    segmentIndex: number,
    sequence: number,
    mimeType: string,
    data: Uint8Array
  ): Promise<AppendChunkResult> {
    const session = this.activeSession
    const track = session?.tracks.get(trackId)
    if (!session || !track) {
      throw new ValidationError('Nenhuma gravacao ativa corresponde a esta trilha.')
    }

    return this.runExclusive(track, async () => {
      if (track.stopped) {
        throw new ValidationError('Nenhuma gravacao ativa corresponde a esta trilha.')
      }

      if (!track.currentSegment) {
        await this.openNewSegment(session, track, segmentIndex, mimeType)
      } else if (segmentIndex > track.currentSegment.seqIndex) {
        await this.finalizeCurrentSegment(track, Date.now())
        await this.openNewSegment(session, track, segmentIndex, mimeType)
        await this.writeManifest('RECORDING', session.startedAtMs)
      }

      const segment = track.currentSegment
      if (!segment || segmentIndex !== segment.seqIndex || sequence <= segment.lastSequence) {
        // Chunk de um segmento ja rotacionado (chegou atrasado) ou fora de ordem/duplicado dentro
        // do segmento atual - descartado para nao corromper o arquivo.
        logger.warn('Chunk fora de ordem/segmento obsoleto ignorado', {
          trackId,
          operation: 'recording.appendChunk'
        })
        return { receivedBytes: 0, totalBytes: segment?.byteSize ?? 0 }
      }

      await segment.fileHandle.write(data)
      segment.byteSize += data.byteLength
      segment.lastSequence = sequence

      return { receivedBytes: data.byteLength, totalBytes: segment.byteSize }
    })
  }

  /**
   * RF-010 (setimo incremento - pausar/retomar). Diferente da segmentacao, pausar/retomar NAO
   * fecha nenhum arquivo - `MediaRecorder.pause()`/`.resume()` (chamados pelo renderer) suspendem
   * e retomam a MESMA gravacao no mesmo container WebM. O main so precisa transicionar a maquina
   * de estados e registrar o intervalo de pausa no manifest; nao ha nada para fazer com os
   * `FileHandle`s abertos (continuam abertos, prontos para o proximo chunk quando retomar).
   */
  async pause(projectId: string): Promise<{ state: RecordingState }> {
    const session = this.activeSession
    if (!session || session.projectId !== projectId) {
      throw new ValidationError('Nenhuma gravacao ativa para este projeto.')
    }

    this.stateMachine.transitionTo('PAUSED')
    session.pauseIntervals.push({ pausedAtMs: Date.now(), resumedAtMs: null })
    await this.writeManifest('PAUSED', session.startedAtMs)

    logger.info('Gravacao pausada', { projectId, operation: 'recording.pause' })
    return { state: this.stateMachine.getState() }
  }

  async resume(projectId: string): Promise<{ state: RecordingState }> {
    const session = this.activeSession
    if (!session || session.projectId !== projectId) {
      throw new ValidationError('Nenhuma gravacao ativa para este projeto.')
    }

    this.stateMachine.transitionTo('RECORDING')
    const currentInterval = session.pauseIntervals.at(-1)
    if (currentInterval && currentInterval.resumedAtMs === null) {
      currentInterval.resumedAtMs = Date.now()
    }
    await this.writeManifest('RECORDING', session.startedAtMs)

    logger.info('Gravacao retomada', { projectId, operation: 'recording.resume' })
    return { state: this.stateMachine.getState() }
  }

  /**
   * RF-016 (oitavo incremento - marcadores). `timestampMs` e relativo ao INICIO da gravacao,
   * descontando toda pausa ja fechada (`pauseIntervals`) - mesma logica de "tempo gravado, nao
   * tempo de parede" ja usada para o cronometro (`elapsedMs`) e para o timer de segmentacao por
   * tempo no renderer, garantindo que o marcador aponte pro mesmo instante que o usuario via no
   * indicador no momento do clique. So permitido durante `RECORDING` (nao `PAUSED`) - decisao
   * registrada: durante a pausa o "instante atual" ja esta congelado (nao ha nada novo pra
   * marcar), e a UI so mostra o botao nesse estado.
   */
  async addMarker(projectId: string, title?: string, note?: string): Promise<MarkerEntity> {
    const session = this.activeSession
    if (!session || session.projectId !== projectId) {
      throw new ValidationError('Nenhuma gravacao ativa para este projeto.')
    }
    if (this.stateMachine.getState() !== 'RECORDING') {
      throw new ValidationError('So e possivel adicionar marcadores enquanto a gravacao esta ativa.')
    }

    const totalPausedMs = session.pauseIntervals.reduce(
      (total, interval) =>
        interval.resumedAtMs === null ? total : total + (interval.resumedAtMs - interval.pausedAtMs),
      0
    )
    const timestampMs = Math.max(0, Date.now() - session.startedAtMs - totalPausedMs)

    const marker: MarkerEntity = {
      id: randomUUID(),
      projectId,
      timestampMs,
      title: title ?? null,
      note: note ?? null
    }
    this.markerRepository.create(marker)

    logger.info('Marcador adicionado', { projectId, operation: 'recording.addMarker' })
    return marker
  }

  listMarkers(projectId: string): MarkerEntity[] {
    return this.markerRepository.listByProject(projectId)
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
        await this.runExclusive(track, async () => {
          // Primeira acao, antes de qualquer await - fecha a corrida com um `appendChunk` que ja
          // estava enfileirado no mutex desta trilha quando `stop()` foi chamado (ver comentario
          // em `TrackSessionState.stopped`).
          track.stopped = true
          await this.finalizeCurrentSegment(track, endedAtMs)
        })
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

    await this.writeManifest('COMPLETED', session.startedAtMs)

    this.stateMachine.transitionTo('COMPLETED')
    const finalState = this.stateMachine.getState()
    this.activeSession = null
    // COMPLETED e terminal no grafo de transicoes - reseta para IDLE para permitir uma nova
    // sessao, mas o estado retornado ao chamador e o COMPLETED capturado acima, nao o IDLE.
    this.stateMachine.reset()

    logger.info('Gravacao finalizada', { projectId, durationMs, operation: 'recording.stop' })
    return { state: finalState }
  }

  /** Serializa mutacoes de UMA trilha (fila FIFO) - reaproveitado por append/rotacao/stop. */
  private runExclusive<T>(track: TrackSessionState, fn: () => Promise<T>): Promise<T> {
    const result = track.mutex.then(fn, fn)
    track.mutex = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async openNewSegment(
    session: ActiveSession,
    track: TrackSessionState,
    seqIndex: number,
    mimeType: string
  ): Promise<void> {
    const info = TRACK_TYPE_INFO[track.type]
    const fileName = buildSegmentFileName(info.sourceName, seqIndex)
    const relativePath = join(SOURCE_ROOT_FOLDER_NAME, info.sourceName, fileName)
    const absolutePath = join(info.getSourcePath(session.paths), fileName)
    const fileHandle = await open(absolutePath, 'w')
    const segmentId = randomUUID()
    const startedAtMs = Date.now()

    this.segmentRepository.create({
      id: segmentId,
      trackId: track.trackId,
      seqIndex,
      relativePath,
      startedAtMs,
      endedAtMs: null,
      durationMs: null,
      byteSize: 0,
      mimeType,
      finalized: false
    })

    track.currentSegment = {
      id: segmentId,
      seqIndex,
      relativePath,
      fileHandle,
      byteSize: 0,
      mimeType,
      lastSequence: -1,
      startedAtMs,
      endedAtMs: null,
      finalized: false
    }
  }

  private async finalizeCurrentSegment(track: TrackSessionState, endedAtMs: number): Promise<void> {
    const segment = track.currentSegment
    if (!segment) return
    await segment.fileHandle.sync()
    await segment.fileHandle.close()
    this.segmentRepository.markFinalized(
      segment.id,
      endedAtMs,
      endedAtMs - segment.startedAtMs,
      segment.byteSize
    )
    segment.endedAtMs = endedAtMs
    segment.finalized = true
    track.finalizedSegments.push(segment)
    track.currentSegment = null
  }

  private async writeManifest(status: RecordingState, startedAtMs: number): Promise<void> {
    // Serializado (nao so encadeado no chamador) porque rotacoes de trilhas DIFERENTES podem
    // disparar escritas do manifest concorrentemente a partir de mutexes de trilha independentes.
    await this.runManifestExclusive(async () => {
      const session = this.activeSession
      if (!session) return

      const tracks: ManifestTrack[] = Array.from(session.tracks.values()).map((track) => {
        const allSegments = [
          ...track.finalizedSegments,
          ...(track.currentSegment ? [track.currentSegment] : [])
        ].sort((a, b) => a.seqIndex - b.seqIndex)

        return {
          id: track.trackId,
          type: TRACK_TYPE_INFO[track.type].manifestType,
          segments: allSegments.map((segment) => ({
            index: segment.seqIndex,
            relativePath: segment.relativePath,
            startedAtMs: segment.startedAtMs,
            endedAtMs: segment.endedAtMs,
            byteSize: segment.byteSize,
            finalized: segment.finalized
          }))
        }
      })

      const manifest: ProjectManifest = {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        projectId: session.projectId,
        status,
        startedAt: new Date(startedAtMs).toISOString(),
        tracks,
        pauseIntervals: session.pauseIntervals
      }

      await writeManifestAtomic(session.paths.manifestPath, manifest)
    })
  }

  private runManifestExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.manifestMutex.then(fn, fn)
    this.manifestMutex = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}
