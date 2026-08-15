import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../database/client'
import type { EditProjectRepository } from '../database/repositories/edit-project.repository'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { TrackRepository } from '../database/repositories/track.repository'
import type { SegmentRepository } from '../database/repositories/segment.repository'
import type { EditOperationRepository } from '../database/repositories/edit-operation.repository'
import type { EditProjectEntity, EditOperationEntity } from '../../shared/types/entities'
import type {
  GetTimelineResponse,
  GetEditedTimelineResponse,
  TimelineTrack,
  CameraTransform,
  LayoutPreset
} from '../../shared/schemas/editor.schema'
import { DEFAULT_CAMERA_TRANSFORM, DEFAULT_LAYOUT_PRESET } from '../../shared/schemas/editor.schema'
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
    private readonly editOperationRepository: EditOperationRepository,
    /**
     * EDIT-012 (vigesimo terceiro incremento - Fase 3, autosave/dirty-state,
     * `05_MEDIA_EDITOR.md` §7-8: "nunca exigir clique em salvar para proteger horas de edicao").
     * `AppDatabase` bruto (nao so os repositorios) especificamente pra `appendOperation` poder
     * envolver suas tres escritas numa UNICA transacao SQLite - ver comentario la embaixo sobre o
     * bug real que isso corrige.
     */
    private readonly db: AppDatabase
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
      revision: 1,
      activeOperationSequence: 0
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
        // Timeline BRUTA - nenhum SET_GAIN/SET_FADE/SET_CAMERA_TRANSFORM (EDIT-008/009/010) ainda
        // foi aplicado. Toda trilha CAMERA nasce com a posicao PiP padrao (DEFAULT_CAMERA_TRANSFORM,
        // "estado neutro" equivalente ao gainDb: 0) - qualquer outro tipo de trilha nao tem posicao
        // (e audio, ou e a propria trilha de fundo).
        return {
          id: track.id,
          type: track.type,
          clips,
          gainDb: 0,
          muted: false,
          fadeInMs: 0,
          fadeOutMs: 0,
          cameraTransform: track.type === 'CAMERA' ? DEFAULT_CAMERA_TRANSFORM : null
        }
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
   * diretamente. `SET_GAIN` (EDIT-008) e `SET_FADE` (EDIT-009) sao aplicados em passagens
   * seguintes, com semantica diferente (substituem, nao acumulam - ver comentarios mais abaixo).
   * Tipos de operacao ainda nao implementados (camera transform/layout - EDIT-010 em diante) sao
   * ignorados silenciosamente - o compilador nunca quebra so porque um tipo futuro apareceu no log.
   *
   * EDIT-007 (decimo oitavo incremento - undo/redo) - so reproduz operacoes com
   * `sequence <= activeOperationSequence` (o cursor no historico); linhas alem do cursor existem
   * fisicamente no banco (sao o "refazer" pendente) mas nao entram no calculo ate um `redo`.
   */
  getEditedTimeline(editProjectId: string): GetEditedTimelineResponse {
    const editProject = this.getEditProject(editProjectId)
    const raw = this.getTimeline(editProjectId)
    const allOperations = this.editOperationRepository.listByEditProject(editProjectId)
    const activeOperations = allOperations.filter(
      (operation) => operation.sequence <= editProject.activeOperationSequence
    )

    let tracks = raw.tracks
    for (const operation of activeOperations) {
      if (operation.type !== 'REMOVE_RANGE') continue
      if (operation.startMs === null || operation.endMs === null) continue
      tracks = applyRemoveRange(tracks, operation.startMs, operation.endMs)
    }
    // Trilha que perdeu todos os clips na edicao (ex.: um REMOVE_RANGE cobrindo a unica trilha de
    // video inteira) some da timeline, mesmo raciocinio ja aplicado em `getTimeline`.
    tracks = tracks.filter((track) => track.clips.length > 0)

    // EDIT-008 - ao contrario de REMOVE_RANGE (cada operacao se COMPOE sobre o resultado da
    // anterior), um SET_GAIN NAO acumula: o mais recente ATIVO por trilha simplesmente SUBSTITUI
    // o `gainDb`/`muted` inteiro daquela trilha. `activeOperations` ja vem ordenado por
    // `sequence` ascendente (`listByEditProject`), entao sobrescrever a cada ocorrencia deixa o
    // ultimo (mais recente) vencer sem precisar procurar o maximo manualmente. Uma trilha que o
    // REMOVE_RANGE acima ja removeu da lista (filter logo abaixo) simplesmente nao aparece no
    // Map - nenhum crash se um SET_GAIN antigo mirar uma trilha que nao existe mais.
    const gainByTrackId = new Map<string, { gainDb: number; muted: boolean }>()
    for (const operation of activeOperations) {
      if (operation.type !== 'SET_GAIN') continue
      if (operation.trackId === null) continue
      const payload = JSON.parse(operation.payloadJson) as { gainDb: number; muted: boolean }
      gainByTrackId.set(operation.trackId, payload)
    }
    tracks = tracks.map((track) => {
      const gain = gainByTrackId.get(track.id)
      return gain ? { ...track, gainDb: gain.gainDb, muted: gain.muted } : track
    })

    // EDIT-009 - mesmo padrao de fold do SET_GAIN acima: um SET_FADE novo SUBSTITUI o
    // fadeInMs/fadeOutMs inteiro da trilha, nao acumula.
    const fadeByTrackId = new Map<string, { fadeInMs: number; fadeOutMs: number }>()
    for (const operation of activeOperations) {
      if (operation.type !== 'SET_FADE') continue
      if (operation.trackId === null) continue
      const payload = JSON.parse(operation.payloadJson) as { fadeInMs: number; fadeOutMs: number }
      fadeByTrackId.set(operation.trackId, payload)
    }
    tracks = tracks.map((track) => {
      const fade = fadeByTrackId.get(track.id)
      return fade ? { ...track, fadeInMs: fade.fadeInMs, fadeOutMs: fade.fadeOutMs } : track
    })

    // EDIT-010 - mesmo padrao de fold do SET_GAIN/SET_FADE acima: um SET_CAMERA_TRANSFORM novo
    // SUBSTITUI o estado inteiro da trilha, nao acumula. So `setTrackTransform` grava esta
    // operacao, e so pra uma trilha `CAMERA` (validado la) - nenhuma outra trilha jamais tem uma
    // dessas no log, entao o `.get()` abaixo nunca colide com uma trilha de audio/tela.
    const cameraTransformByTrackId = new Map<string, CameraTransform>()
    for (const operation of activeOperations) {
      if (operation.type !== 'SET_CAMERA_TRANSFORM') continue
      if (operation.trackId === null) continue
      const payload = JSON.parse(operation.payloadJson) as CameraTransform
      cameraTransformByTrackId.set(operation.trackId, payload)
    }
    tracks = tracks.map((track) => {
      const transform = cameraTransformByTrackId.get(track.id)
      return transform ? { ...track, cameraTransform: transform } : track
    })

    // EDIT-011 - layout e uma propriedade da COMPOSICAO INTEIRA, nao de uma trilha (`trackId` e
    // sempre `null` num `SET_LAYOUT`, mesmo padrao de `REMOVE_RANGE`) - so precisa do ULTIMO ativo
    // (nao ha "por trilha" pra iterar). `DEFAULT_LAYOUT_PRESET` quando nenhum esta ativo.
    let layoutPreset: LayoutPreset = DEFAULT_LAYOUT_PRESET
    for (const operation of activeOperations) {
      if (operation.type !== 'SET_LAYOUT') continue
      layoutPreset = (JSON.parse(operation.payloadJson) as { preset: LayoutPreset }).preset
    }

    return {
      ...raw,
      tracks,
      totalDurationMs: computeTotalDurationMs(tracks),
      canUndo: editProject.activeOperationSequence > 0,
      canRedo: editProject.activeOperationSequence < allOperations.length,
      layoutPreset
    }
  }

  /**
   * Corte/split/remover-intervalo (`05_MEDIA_EDITOR.md` §4) - ver comentario em
   * `RemoveRangeRequestSchema` (shared) sobre os tres serem o MESMO primitivo aqui. Valida contra
   * a timeline EDITADA ATUAL (nao a bruta) - `endMs` alem do fim atual, ou um intervalo vazio,
   * sao rejeitados antes de qualquer escrita.
   *
   * EDIT-007 - se o cursor NAO estiver no fim do log (o usuario desfez uma ou mais operacoes e
   * agora esta criando algo novo), poda fisicamente qualquer coisa alem do cursor ANTES de
   * inserir - mesmo comportamento padrao de qualquer editor: uma acao nova invalida o "refazer"
   * pendente, entao aquele ramo do historico nunca mais seria alcancavel de qualquer forma.
   */
  removeRange(editProjectId: string, startMs: number, endMs: number): GetEditedTimelineResponse {
    const editProject = this.getEditProject(editProjectId)
    const current = this.getEditedTimeline(editProjectId)
    if (startMs >= endMs) {
      throw new ValidationError('startMs deve ser menor que endMs')
    }
    if (endMs > current.totalDurationMs) {
      throw new ValidationError('O intervalo informado vai alem do fim atual da timeline')
    }

    this.appendOperation(editProjectId, editProject, {
      type: 'REMOVE_RANGE',
      startMs,
      endMs,
      trackId: null,
      payloadJson: '{}'
    })

    return this.getEditedTimeline(editProjectId)
  }

  /**
   * EDIT-008 (decimo nono incremento - Fase 3, ganho/mudo, `05_MEDIA_EDITOR.md` §4). `gainDb`
   * limitado a [-60, 0] - ver comentario em `TimelineTrackSchema` sobre a limitacao do player
   * nativo (sem amplificacao acima do volume original sem Web Audio API). Valida que `trackId`
   * existe na timeline EDITADA ATUAL antes de gravar a operacao - mesmo espirito defensivo de
   * `removeRange` validar `endMs` contra `getEditedTimeline()`, nao a bruta.
   */
  setTrackGain(
    editProjectId: string,
    trackId: string,
    gainDb: number,
    muted: boolean
  ): GetEditedTimelineResponse {
    const editProject = this.getEditProject(editProjectId)
    const current = this.getEditedTimeline(editProjectId)
    if (!current.tracks.some((track) => track.id === trackId)) {
      throw new NotFoundError(`Trilha nao encontrada na timeline atual: ${trackId}`)
    }

    this.appendOperation(editProjectId, editProject, {
      type: 'SET_GAIN',
      startMs: null,
      endMs: null,
      trackId,
      payloadJson: JSON.stringify({ gainDb, muted })
    })

    return this.getEditedTimeline(editProjectId)
  }

  /**
   * EDIT-009 (vigesimo incremento - Fase 3, fade in/out, `05_MEDIA_EDITOR.md` §4). Mesmo padrao
   * de `setTrackGain`: substitui o estado inteiro da trilha, valida `trackId` contra a timeline
   * editada atual. `fadeInMs`/`fadeOutMs` sao duracoes relativas ao proprio inicio/fim da trilha
   * (nao timestamps absolutos) - o player (`fadeVolumeMultiplier`, renderer) calcula a partir do
   * primeiro/ultimo clip da trilha a cada instante.
   */
  setTrackFade(
    editProjectId: string,
    trackId: string,
    fadeInMs: number,
    fadeOutMs: number
  ): GetEditedTimelineResponse {
    const editProject = this.getEditProject(editProjectId)
    const current = this.getEditedTimeline(editProjectId)
    if (!current.tracks.some((track) => track.id === trackId)) {
      throw new NotFoundError(`Trilha nao encontrada na timeline atual: ${trackId}`)
    }

    this.appendOperation(editProjectId, editProject, {
      type: 'SET_FADE',
      startMs: null,
      endMs: null,
      trackId,
      payloadJson: JSON.stringify({ fadeInMs, fadeOutMs })
    })

    return this.getEditedTimeline(editProjectId)
  }

  /**
   * EDIT-010 (vigesimo primeiro incremento - Fase 3, visibilidade/transformacao de camera,
   * `05_MEDIA_EDITOR.md` §4). Mesmo padrao de `setTrackGain`/`setTrackFade`: substitui o estado
   * inteiro da trilha, valida `trackId` contra a timeline editada atual. Ao contrario de
   * ganho/fade, so faz sentido pra uma trilha `CAMERA` - posicao/tamanho nao tem significado pra
   * audio, e a trilha de tela e sempre o FUNDO do preview, nunca um overlay posicionavel.
   */
  setTrackTransform(
    editProjectId: string,
    trackId: string,
    transform: CameraTransform
  ): GetEditedTimelineResponse {
    const editProject = this.getEditProject(editProjectId)
    const current = this.getEditedTimeline(editProjectId)
    const track = current.tracks.find((candidate) => candidate.id === trackId)
    if (!track) {
      throw new NotFoundError(`Trilha nao encontrada na timeline atual: ${trackId}`)
    }
    if (track.type !== 'CAMERA') {
      throw new ValidationError('Transformacao de camera so e valida para uma trilha CAMERA')
    }

    this.appendOperation(editProjectId, editProject, {
      type: 'SET_CAMERA_TRANSFORM',
      startMs: null,
      endMs: null,
      trackId,
      payloadJson: JSON.stringify(transform)
    })

    return this.getEditedTimeline(editProjectId)
  }

  /**
   * EDIT-011 (vigesimo segundo incremento - Fase 3, layout, `05_MEDIA_EDITOR.md` §4). Ao
   * contrario de todas as operacoes anteriores do log, NAO mira uma trilha especifica - layout e
   * uma propriedade da composicao inteira (ver comentario em `LayoutPresetSchema`), gravada com
   * `trackId: null` mesmo padrao de `REMOVE_RANGE`. Sem validacao de trilha - qualquer um dos 4
   * presets e sempre valido, independente de quais trilhas existem na timeline (um `SCREEN_ONLY`
   * numa gravacao so-de-camera simplesmente nao muda nada visualmente, sem erro).
   */
  setLayoutPreset(editProjectId: string, preset: LayoutPreset): GetEditedTimelineResponse {
    const editProject = this.getEditProject(editProjectId)

    this.appendOperation(editProjectId, editProject, {
      type: 'SET_LAYOUT',
      startMs: null,
      endMs: null,
      trackId: null,
      payloadJson: JSON.stringify({ preset })
    })

    return this.getEditedTimeline(editProjectId)
  }

  /**
   * EDIT-007/EDIT-008/EDIT-009/EDIT-010/EDIT-011 - ponto UNICO onde uma operacao NOVA e gravada no
   * log, reusado por `removeRange`, `setTrackGain`, `setTrackFade`, `setTrackTransform` e
   * `setLayoutPreset`. Sempre poda (`DELETE`) qualquer coisa alem do cursor ANTES de inserir - uma
   * acao nova invalida o "refazer" pendente, o mesmo comportamento padrao de qualquer editor,
   * independente do TIPO da operacao (nem se ela tem `trackId` ou nao).
   *
   * EDIT-012 - as tres escritas (`deleteAfterSequence`, `create`, `touchAfterEdit`) SEMPRE
   * acontecem dentro de uma UNICA transacao SQLite (`this.db.transaction`). Bug real que isso
   * corrige: antes do EDIT-012 eram tres `.run()` independentes, cada um auto-commitando na hora -
   * um crash do processo (queda de energia, `kill -9`, o app forcado a fechar) entre o `create` e
   * o `touchAfterEdit` deixava uma linha NOVA gravada no log com `sequence = N+1`, mas
   * `activeOperationSequence` ainda em `N` - a operacao ficava fisicamente no banco porem invisivel
   * pra `getEditedTimeline` (filtra `sequence <= activeOperationSequence`), silenciosamente
   * "perdendo" a ULTIMA edicao do usuario antes do crash sem nenhum sinal de erro. Com a transacao,
   * ou as tres escritas commitam juntas, ou nenhuma commita - nunca um meio-termo inconsistente.
   * Exatamente o tipo de garantia que "autosave: nunca exigir salvar pra proteger horas de edicao"
   * (`05_MEDIA_EDITOR.md` §8) pressupoe existir, mas que so ficou explicita a partir deste
   * incremento.
   */
  private appendOperation(
    editProjectId: string,
    editProject: EditProjectEntity,
    fields: Pick<EditOperationEntity, 'type' | 'startMs' | 'endMs' | 'trackId' | 'payloadJson'>
  ): void {
    this.db.transaction(() => {
      this.editOperationRepository.deleteAfterSequence(
        editProjectId,
        editProject.activeOperationSequence
      )
      const newSequence = editProject.activeOperationSequence + 1
      const operation: EditOperationEntity = {
        id: randomUUID(),
        editProjectId,
        sequence: newSequence,
        ...fields
      }
      this.editOperationRepository.create(operation)
      this.editProjectRepository.touchAfterEdit(editProjectId, {
        revision: editProject.revision + 1,
        activeOperationSequence: newSequence
      })
    })
  }

  /**
   * EDIT-007 (decimo oitavo incremento - desfazer/refazer). NUNCA apaga uma operacao do log -
   * so move o cursor (`activeOperationSequence`) uma posicao para tras. Rejeita se ja nao houver
   * nada ativo pra desfazer (cursor no zero).
   */
  undo(editProjectId: string): GetEditedTimelineResponse {
    const editProject = this.getEditProject(editProjectId)
    if (editProject.activeOperationSequence <= 0) {
      throw new ValidationError('Nao ha nada para desfazer')
    }
    this.editProjectRepository.touchAfterEdit(editProjectId, {
      revision: editProject.revision + 1,
      activeOperationSequence: editProject.activeOperationSequence - 1
    })
    return this.getEditedTimeline(editProjectId)
  }

  /**
   * EDIT-007 - move o cursor uma posicao pra frente, reativando a proxima operacao do log (se
   * houver uma alem do cursor atual - o "refazer" so existe enquanto nenhuma operacao NOVA foi
   * criada depois do undo que a tornou pendente, ver `removeRange`).
   */
  redo(editProjectId: string): GetEditedTimelineResponse {
    const editProject = this.getEditProject(editProjectId)
    const allOperations = this.editOperationRepository.listByEditProject(editProjectId)
    if (editProject.activeOperationSequence >= allOperations.length) {
      throw new ValidationError('Nao ha nada para refazer')
    }
    this.editProjectRepository.touchAfterEdit(editProjectId, {
      revision: editProject.revision + 1,
      activeOperationSequence: editProject.activeOperationSequence + 1
    })
    return this.getEditedTimeline(editProjectId)
  }
}

function computeTotalDurationMs(tracks: TimelineTrack[]): number {
  return tracks.reduce((max, track) => {
    const trackEnd = track.clips.reduce((clipMax, clip) => Math.max(clipMax, clip.endMs), 0)
    return Math.max(max, trackEnd)
  }, 0)
}
