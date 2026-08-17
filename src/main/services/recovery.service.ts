import { stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { TrackRepository } from '../database/repositories/track.repository'
import type { SegmentRepository } from '../database/repositories/segment.repository'
import type { SegmentEntity } from '../../shared/types/entities'
import {
  projectPathsFromRoot,
  readManifest,
  writeManifestAtomic,
  assertPathWithinBoundary,
  toManifestTrackType,
  type ProjectManifest,
  type ManifestTrack
} from '../media/project-filesystem'
import { ValidationError, NotFoundError } from '../../shared/types/domain-errors'
import type { RecordingState } from '../../shared/types/recording-state'
import { MANIFEST_SCHEMA_VERSION } from '../../shared/constants/app-info'
import { createScopedLogger } from './logger'

const logger = createScopedLogger('recovery')

/**
 * Estados que so existem enquanto uma sessao de gravacao esta de fato em memoria
 * (`RecordingSessionManager.activeSession`). Um processo recem-iniciado nunca tem nenhuma sessao
 * ativa ainda (o `RecordingSessionManager` sempre comeca com `activeSession = null`) - entao
 * encontrar um projeto NESTES estados no boot so pode significar que o processo anterior morreu
 * (crash, encerramento forcado, queda de energia) antes de `stop()`/`writeManifest('COMPLETED', ...)`
 * rodar. RECOV-002 (03_TECHNICAL_ARCHITECTURE.md, 11_ROADMAP_BACKLOG.md).
 */
const INTERRUPTIBLE_STATES: readonly RecordingState[] = [
  'PREPARING',
  'RECORDING',
  'PAUSED',
  'STOPPING',
  'FINALIZING'
]

export interface RepairResult {
  projectId: string
  status: 'COMPLETED' | 'FAILED'
  recoveredSegments: number
  discardedSegments: number
}

/**
 * RECOV-001 (manifest.json, ja existente desde a Fase 0/1) + RECOV-002 (deteccao) + RECOV-003
 * (reparo) - decimo incremento, Fase 2. Ver README "Decisoes de arquitetura" para o raciocinio
 * completo por tras de cada escolha abaixo.
 */
export class RecoveryService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly trackRepository: TrackRepository,
    private readonly segmentRepository: SegmentRepository,
    private readonly libraryRootPath: string
  ) {}

  /**
   * Chamado uma unica vez no boot (`main/index.ts`), depois das migrations e antes de qualquer
   * janela/handler IPC ficar acessivel. Idempotente: rodar de novo so re-processa projetos ainda
   * em `INTERRUPTIBLE_STATES` - um projeto ja `RECOVERABLE`/`COMPLETED`/`FAILED` e ignorado.
   * So flipa o campo `status` do manifest (quando legivel) - NUNCA tenta reconstruir a lista de
   * segmentos aqui; isso e trabalho do `repair()`, que usa o banco (fonte mais confiavel - ver
   * comentario em `repair()`) para isso.
   */
  async detectIncomplete(): Promise<string[]> {
    const candidates = this.projectRepository
      .list()
      .filter((project) => INTERRUPTIBLE_STATES.includes(project.status))

    const detected: string[] = []
    for (const project of candidates) {
      const paths = projectPathsFromRoot(project.rootPath)
      const manifest = await readManifest(paths.manifestPath)

      if (manifest) {
        await writeManifestAtomic(paths.manifestPath, { ...manifest, status: 'RECOVERABLE' })
      } else {
        logger.warn('Projeto interrompido sem manifest legivel - marcado RECOVERABLE mesmo assim', {
          projectId: project.id,
          operation: 'recovery.detectIncomplete'
        })
      }

      this.projectRepository.updateStatus(project.id, 'RECOVERABLE')
      detected.push(project.id)
      logger.info('Gravacao incompleta detectada no boot', {
        projectId: project.id,
        operation: 'recovery.detectIncomplete'
      })
    }
    return detected
  }

  /**
   * Enumera trilhas/segmentos a partir do BANCO, nao do manifest.json - achado importante
   * registrado aqui: o manifest so e reescrito no `start()`, a cada ROTACAO de segmento e no
   * `stop()` (ver `recording-session-manager.ts`); o segmento atualmente aberto de uma trilha que
   * nunca rotacionou fica de fora do manifest ate o proximo desses eventos. Um crash durante o
   * PRIMEIRO segmento de cada trilha (o caso mais comum) deixaria o manifest mostrando um array de
   * segmentos vazio, mesmo com dados reais gravados no disco - o banco, ao contrario, ganha a
   * linha do segmento de forma sincrona no primeiro chunk (`segmentRepository.create` em
   * `openNewSegment`), entao e a lista mais confiavel do que existiu.
   *
   * Cada segmento e validado contra o arquivo REAL no disco (existe + tamanho > 0) - nem o
   * `byteSize` da linha do banco (so atualizado em `markFinalized`, ou seja, tambem defasado para
   * o segmento aberto no momento do crash) reflete com certeza quantos bytes chegaram ao disco;
   * `fs.stat()` no proprio arquivo e o unico dado pos-crash confiavel. Segmentos invalidos
   * (ausentes ou 0 bytes) sao descartados do banco. Segmentos validos ainda nao finalizados sao
   * promovidos a `finalized: true` best-effort, mesmo sem o evento `stop()` do `MediaRecorder` -
   * um WebM escrito em chunks sucessivos e um formato "streamable" (nao exige um trailer/Cues
   * final para a maior parte dos players conseguirem abrir e tocar os dados ja gravados), entao
   * perder so o ultimo flush de alguns ms e preferivel a descartar o segmento inteiro. O
   * manifest.json e inteiramente RECONSTRUIDO a partir do banco ja corrigido ao final - autocura a
   * propria defasagem que motivou usar o banco como fonte aqui.
   */
  async repair(projectId: string): Promise<RepairResult> {
    const project = this.projectRepository.findById(projectId)
    if (!project) throw new NotFoundError(`Projeto nao encontrado: ${projectId}`)
    if (project.status !== 'RECOVERABLE') {
      throw new ValidationError(
        `Projeto nao esta em estado recuperavel (status atual: ${project.status}).`
      )
    }

    const paths = projectPathsFromRoot(project.rootPath)
    const existingManifest = await readManifest(paths.manifestPath)
    const dbTracks = this.trackRepository.listByProject(projectId)

    let recoveredSegments = 0
    let discardedSegments = 0
    let latestEndedAtMs: number | null = null
    const repairedTracks: ManifestTrack[] = []

    for (const track of dbTracks) {
      const validSegments: SegmentEntity[] = []

      for (const segment of this.segmentRepository.listByTrack(track.id)) {
        const absolutePath = join(paths.rootPath, segment.relativePath)
        assertPathWithinBoundary(absolutePath, paths.rootPath)
        const realByteSize = await this.statSizeOrZero(absolutePath)

        if (realByteSize <= 0) {
          discardedSegments += 1
          this.segmentRepository.deleteById(segment.id)
          // Remove tambem o arquivo vazio/inutilizavel em si - nunca deixar um resto de 0 bytes
          // parado na pasta `source/` so porque a linha do banco ja foi limpa.
          await unlink(absolutePath).catch(() => undefined)
          continue
        }

        recoveredSegments += 1
        const endedAtMs = segment.endedAtMs
        if (endedAtMs !== null) {
          latestEndedAtMs =
            latestEndedAtMs === null ? endedAtMs : Math.max(latestEndedAtMs, endedAtMs)
        }
        if (!segment.finalized) {
          this.segmentRepository.markFinalized(
            segment.id,
            endedAtMs ?? Date.now(),
            endedAtMs !== null ? Math.max(0, endedAtMs - segment.startedAtMs) : 0,
            realByteSize
          )
        }
        validSegments.push({ ...segment, byteSize: realByteSize, finalized: true })
      }

      if (validSegments.length > 0) {
        repairedTracks.push({
          id: track.id,
          type: toManifestTrackType(track.type),
          segments: validSegments
            .sort((a, b) => a.seqIndex - b.seqIndex)
            .map((segment) => ({
              index: segment.seqIndex,
              relativePath: segment.relativePath,
              startedAtMs: segment.startedAtMs,
              endedAtMs: segment.endedAtMs,
              byteSize: segment.byteSize,
              finalized: true
            }))
        })
      }
    }

    // Nenhum segmento sobreviveu em NENHUMA trilha -> nao ha nada de fato para reproduzir/editar
    // depois; marcar COMPLETED aqui enganaria o usuario com um "sucesso" vazio na Biblioteca.
    const finalStatus: 'COMPLETED' | 'FAILED' = repairedTracks.length > 0 ? 'COMPLETED' : 'FAILED'
    const startedAt = existingManifest?.startedAt ?? project.startedAt
    const repairedManifest: ProjectManifest = {
      schemaVersion: existingManifest?.schemaVersion ?? MANIFEST_SCHEMA_VERSION,
      projectId,
      status: finalStatus,
      startedAt,
      tracks: repairedTracks,
      pauseIntervals: existingManifest?.pauseIntervals ?? []
    }
    await writeManifestAtomic(paths.manifestPath, repairedManifest)

    const startedAtMs = startedAt ? new Date(startedAt).getTime() : null
    const durationMs =
      finalStatus === 'COMPLETED' && startedAtMs !== null && latestEndedAtMs !== null
        ? Math.max(0, latestEndedAtMs - startedAtMs)
        : null

    this.projectRepository.updateRecordingLifecycle(projectId, {
      status: finalStatus,
      endedAt: new Date().toISOString(),
      durationMs
    })

    logger.info('Reparo de gravacao concluido', { projectId, operation: 'recovery.repair' })

    return { projectId, status: finalStatus, recoveredSegments, discardedSegments }
  }

  private async statSizeOrZero(path: string): Promise<number> {
    try {
      const info = await stat(path)
      return info.isFile() ? info.size : 0
    } catch {
      return 0
    }
  }
}
