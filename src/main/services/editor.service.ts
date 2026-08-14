import { randomUUID } from 'node:crypto'
import type { EditProjectRepository } from '../database/repositories/edit-project.repository'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { TrackRepository } from '../database/repositories/track.repository'
import type { SegmentRepository } from '../database/repositories/segment.repository'
import type { EditOperationRepository } from '../database/repositories/edit-operation.repository'
import type { EditProjectEntity, EditOperationEntity } from '../../shared/types/entities'
import type { GetTimelineResponse, TimelineTrack } from '../../shared/schemas/editor.schema'
import { NotFoundError, ValidationError } from '../../shared/types/domain-errors'
import { applyRemoveRange } from './apply-remove-range'

/**
 * EDIT-001 (decimo segundo incremento - Fase 3, Editor MVP). Cria/consulta projetos de edicao
 * (`EditProject`) vinculados a uma gravacao (`Project`). Sem restricao de unicidade - a mesma
 * gravacao pode ter varios projetos de edicao independentes (ver comentario em
 * `shared/schemas/editor.schema.ts`).
 */
export class EditorService {
  constructor(
    private readonly editProjectRepository: EditProjectRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly trackRepository: TrackRepository,
    private readonly segmentRepository: SegmentRepository,
    private readonly editOperationRepository: EditOperationRepository
  ) {}

  /**
   * So permite criar um projeto de edicao para uma gravacao `COMPLETED` - editar uma gravacao
   * ainda `RECORDING`/`PAUSED` corromperia arquivos ainda em uso pelo `RecordingSessionManager`
   * (mesmo raciocinio de `ProjectService.assertNoActiveSession`); editar uma `RECOVERABLE`/
   * `FAILED` nao faz sentido antes de reparar (RECOV-003) ou aceitar a perda dos dados.
   */
  createEditProject(projectId: string, name?: string): EditProjectEntity {
    const project = this.projectRepository.findById(projectId)
    if (!project) throw new NotFoundError(`Projeto nao encontrado: ${projectId}`)
    if (project.status !== 'COMPLETED') {
      throw new ValidationError(
        'So e possivel editar uma gravacao concluida. Repare ou finalize a gravacao primeiro.'
      )
    }

    const now = new Date().toISOString()
    const editProject: EditProjectEntity = {
      id: randomUUID(),
      projectId,
      name: name ?? project.title,
      createdAt: now,
      updatedAt: now,
      revision: 1
    }
    return this.editProjectRepository.create(editProject)
  }

  getEditProject(id: string): EditProjectEntity {
    const editProject = this.editProjectRepository.findById(id)
    if (!editProject) throw new NotFoundError(`Projeto de edicao nao encontrado: ${id}`)
    return editProject
  }

  listEditProjects(): EditProjectEntity[] {
    return this.editProjectRepository.listAll()
  }

  /**
   * EDIT-002 (decimo terceiro incremento - timeline). Nesta etapa cada clip e sempre 1:1 com um
   * segmento gravado - nenhuma operacao de edicao (`edit_operations`: trim/split/remove) ainda
   * existe, entao a timeline "compilada" e so os segmentos posicionados num eixo 0-based.
   *
   * O eixo usa `project.startedAt` (inicio da SESSAO inteira, nao do segmento) como ancora -
   * mesmo raciocinio ja usado por marcadores/cronometro durante a gravacao (`timestampMs`
   * relativo ao inicio, nao tempo de parede): garante que trilhas que comecaram a gravar
   * alguns ms depois uma da outra (ex.: camera pronta antes do microfone) fiquem alinhadas no
   * mesmo referencial, nao cada uma comecando do zero.
   *
   * So segmentos `finalized` entram na timeline - um segmento nao finalizado so poderia existir
   * aqui se o reparo (RECOV-003) tivesse deixado algo inconsistente, o que ele especificamente
   * evita (repara ou descarta, nunca deixa `finalized: false` para tras).
   */
  getTimeline(editProjectId: string): GetTimelineResponse {
    const editProject = this.getEditProject(editProjectId)
    const project = this.projectRepository.findById(editProject.projectId)
    if (!project) {
      throw new NotFoundError(`Projeto nao encontrado: ${editProject.projectId}`)
    }

    const anchorMs = project.startedAt ? new Date(project.startedAt).getTime() : 0

    const tracks: TimelineTrack[] = this.trackRepository
      .listByProject(project.id)
      .map((track) => {
        const clips = this.segmentRepository
          .listByTrack(track.id)
          .filter((segment) => segment.finalized)
          .sort((a, b) => a.seqIndex - b.seqIndex)
          .map((segment) => {
            const startMs = Math.max(0, segment.startedAtMs - anchorMs)
            const durationMs =
              segment.durationMs ??
              (segment.endedAtMs !== null ? segment.endedAtMs - segment.startedAtMs : 0)
            return {
              segmentId: segment.id,
              seqIndex: segment.seqIndex,
              relativePath: segment.relativePath,
              startMs,
              endMs: startMs + Math.max(0, durationMs),
              // Timeline BRUTA - todo clip usa o segmento inteiro desde o proprio inicio. So a
              // timeline EDITADA (`getEditedTimeline`) pode produzir um `sourceStartMs` > 0.
              sourceStartMs: 0,
              byteSize: segment.byteSize
            }
          })
        return { id: track.id, type: track.type, clips }
      })
      // Trilha sem nenhum clip sobrevivente (ex.: audio do sistema sem suporte na plataforma,
      // RF-005) nao aparece na timeline - nada para desenhar, so ruido visual.
      .filter((track) => track.clips.length > 0)

    const totalDurationMs = tracks.reduce((max, track) => {
      const trackEnd = track.clips.reduce((clipMax, clip) => Math.max(clipMax, clip.endMs), 0)
      return Math.max(max, trackEnd)
    }, 0)

    return { editProjectId, projectId: project.id, totalDurationMs, tracks }
  }

  /**
   * EDIT-004/005/006 (decimo setimo incremento - primeira operacao de edicao real). A timeline
   * BRUTA (`getTimeline`) com o LOG ordenado de `edit_operations` aplicado por cima, uma operacao
   * de cada vez, em `sequence` - cada `REMOVE_RANGE` opera sobre o RESULTADO da anterior (a
   * timeline "atual" do ponto de vista do usuario naquele momento), nunca sobre a bruta original
   * diretamente. Tipos de operacao ainda nao implementados (gain/fade/camera transform - EDIT-008
   * em diante) sao ignorados silenciosamente - o compilador nunca quebra so porque um tipo futuro
   * apareceu no log.
   */
  getEditedTimeline(editProjectId: string): GetTimelineResponse {
    const raw = this.getTimeline(editProjectId)
    const operations = this.editOperationRepository.listByEditProject(editProjectId)

    let tracks = raw.tracks
    for (const operation of operations) {
      if (operation.type !== 'REMOVE_RANGE') continue
      if (operation.startMs === null || operation.endMs === null) continue
      tracks = applyRemoveRange(tracks, operation.startMs, operation.endMs)
    }
    // Trilha que perdeu todos os clips na edicao (ex.: um REMOVE_RANGE cobrindo a unica trilha de
    // video inteira) some da timeline, mesmo raciocinio ja aplicado em `getTimeline`.
    tracks = tracks.filter((track) => track.clips.length > 0)

    return { ...raw, tracks, totalDurationMs: computeTotalDurationMs(tracks) }
  }

  /**
   * Corte/split/remover-intervalo (`05_MEDIA_EDITOR.md` §4) - ver comentario em
   * `RemoveRangeRequestSchema` (shared) sobre os tres serem o MESMO primitivo aqui. Valida contra
   * a timeline EDITADA ATUAL (nao a bruta) - `endMs` alem do fim atual, ou um intervalo vazio,
   * sao rejeitados antes de qualquer escrita.
   */
  removeRange(editProjectId: string, startMs: number, endMs: number): GetTimelineResponse {
    const editProject = this.getEditProject(editProjectId)
    const current = this.getEditedTimeline(editProjectId)
    if (startMs >= endMs) {
      throw new ValidationError('startMs deve ser menor que endMs')
    }
    if (endMs > current.totalDurationMs) {
      throw new ValidationError('O intervalo informado vai alem do fim atual da timeline')
    }

    const operations = this.editOperationRepository.listByEditProject(editProjectId)
    const operation: EditOperationEntity = {
      id: randomUUID(),
      editProjectId,
      sequence: operations.length + 1,
      type: 'REMOVE_RANGE',
      startMs,
      endMs,
      trackId: null,
      payloadJson: '{}'
    }
    this.editOperationRepository.create(operation)
    this.editProjectRepository.touchAfterEdit(editProjectId, editProject.revision + 1)

    return this.getEditedTimeline(editProjectId)
  }
}

function computeTotalDurationMs(tracks: TimelineTrack[]): number {
  return tracks.reduce((max, track) => {
    const trackEnd = track.clips.reduce((clipMax, clip) => Math.max(clipMax, clip.endMs), 0)
    return Math.max(max, trackEnd)
  }, 0)
}
