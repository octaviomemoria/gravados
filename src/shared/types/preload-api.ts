/**
 * Forma publica de `window.meetingStudio` (03_TECHNICAL_ARCHITECTURE.md secao 2 - exemplo
 * conceitual: `recording.start()`, `recording.stop()`, `library.list()`, `export.start()`).
 * Definido em `shared/` (nao em `preload/`) para que o renderer possa importa-lo sem criar uma
 * dependencia cruzada entre os projetos TS `tsconfig.node.json`/`tsconfig.web.json` - o objeto
 * real montado em `preload/index.ts` e checado estruturalmente contra este tipo.
 *
 * `library` e um alias somente-leitura do dominio `project` (mesmos canais IPC por baixo),
 * mantendo o nome usado no exemplo da documentacao ao lado da nomenclatura de entidade do banco
 * (`projects`, usada em 06_DATA_MODEL.md e em todo o schema Drizzle).
 */
import type {
  CreateProjectRequest,
  ProjectResponse,
  ProjectDetailsResponse
} from '../schemas/project.schema'
import type { SettingsCategory } from '../schemas/settings.schema'
import type {
  StartRecordingRequest,
  RecordingTrackHandle,
  AppendRecordingChunkRequest,
  StopRecordingRequest,
  PauseRecordingRequest,
  ResumeRecordingRequest,
  AddMarkerRequest
} from '../schemas/recording.schema'
import type { MarkerResponse } from '../schemas/markers.schema'
import type { RepairProjectResponse } from '../schemas/recovery.schema'
import type {
  EditProjectResponse,
  GetTimelineResponse,
  GetEditedTimelineResponse,
  CameraTransform,
  LayoutPreset
} from '../schemas/editor.schema'
import type { StartExportRequest, ExportJobResponse } from '../schemas/export.schema'
import type {
  TranscriptionJobResponse,
  TranscriptResponse
} from '../schemas/transcription.schema'
import type { SearchTranscriptsResponse } from '../schemas/search.schema'
import type { ScreenSource } from '../schemas/devices.schema'
import type { RecordingState } from './recording-state'

export interface ProjectApi {
  create: (request: CreateProjectRequest) => Promise<ProjectResponse>
  list: () => Promise<ProjectResponse[]>
  get: (id: string) => Promise<ProjectResponse>
  /** LIB-002 - resumo por trilha (tipo, segmentos, bytes) + bytes totais do projeto. */
  getDetails: (id: string) => Promise<ProjectDetailsResponse>
  /** RF-017 - abre a pasta do projeto no explorador de arquivos do SO. */
  openFolder: (id: string) => Promise<{ opened: boolean }>
  /** LIB-004 + refinamento posterior - renomeia o titulo do projeto e, opcionalmente, atualiza
   * `notes` (`null` limpa, omitido nao altera). Rejeita se houver gravacao ativa. */
  rename: (id: string, title: string, notes?: string | null) => Promise<ProjectResponse>
  /** LIB-006 - exclusao permanente (banco + arquivos). Rejeita se houver gravacao ativa. */
  delete: (id: string) => Promise<{ deleted: boolean }>
}

export interface LibraryApi {
  list: () => Promise<ProjectResponse[]>
  get: (id: string) => Promise<ProjectResponse>
  getDetails: (id: string) => Promise<ProjectDetailsResponse>
}

export interface SettingsApi {
  get: (category: SettingsCategory) => Promise<Record<string, unknown>>
  update: (
    category: SettingsCategory,
    value: Record<string, unknown>
  ) => Promise<Record<string, unknown>>
}

export interface RecordingApi {
  start: (
    request: StartRecordingRequest
  ) => Promise<{ state: RecordingState; tracks: RecordingTrackHandle[] }>
  appendChunk: (
    request: AppendRecordingChunkRequest
  ) => Promise<{ receivedBytes: number; totalBytes: number }>
  stop: (request: StopRecordingRequest) => Promise<{ state: RecordingState }>
  pause: (request: PauseRecordingRequest) => Promise<{ state: RecordingState }>
  resume: (request: ResumeRecordingRequest) => Promise<{ state: RecordingState }>
  /** RF-016 - cria um marcador no instante atual da sessao ativa (so durante `RECORDING`). */
  addMarker: (request: AddMarkerRequest) => Promise<{ marker: MarkerResponse }>
  getState: () => Promise<{ state: RecordingState }>
}

export interface MarkersApi {
  /** RF-016 - marcadores de um projeto, ordenados por `timestampMs`. Nao depende de sessao ativa. */
  list: (projectId: string) => Promise<MarkerResponse[]>
  /** Refinamento pós-LIB-PLAYER - edita título/nota de um marcador já criado. Campos omitidos do
   * `patch` ficam inalterados; `null` explícito limpa o campo. Nunca depende de sessão ativa. */
  update: (id: string, patch: { title?: string | null; note?: string | null }) => Promise<MarkerResponse>
  /** Exclusão permanente - `deleted: false` (sem lançar) quando o marcador já não existe mais. */
  delete: (id: string) => Promise<{ deleted: boolean }>
}

export interface RecoveryApi {
  /** RECOV-003 - repara um projeto `RECOVERABLE` (detectado no boot), validando cada segmento
   * contra o arquivo real no disco. Rejeita se o projeto nao estiver `RECOVERABLE`. */
  repair: (id: string) => Promise<RepairProjectResponse>
}

export interface EditorApi {
  /** EDIT-001 - cria um novo projeto de edicao para uma gravacao `COMPLETED`. `name` opcional
   * (padrao: titulo da gravacao). Nenhuma restricao de unicidade - a mesma gravacao pode ter
   * varios projetos de edicao. */
  create: (projectId: string, name?: string) => Promise<EditProjectResponse>
  get: (id: string) => Promise<EditProjectResponse>
  /** Lista TODOS os projetos de edicao (de qualquer gravacao) - visao geral da tela "/editor". */
  list: () => Promise<EditProjectResponse[]>
  /** EDIT-002 - timeline compilada (cada clip 1:1 com um segmento gravado, nenhuma operacao de
   * edicao ainda aplicada), posicionada num eixo 0-based ancorado no inicio da sessao. */
  getTimeline: (editProjectId: string) => Promise<GetTimelineResponse>
  /** EDIT-004/005/006 - a timeline BRUTA com o log de `edit_operations` ja aplicado por cima
   * (hoje so `REMOVE_RANGE`) ate o cursor ativo (EDIT-007). O que a UI de fato mostra/reproduz;
   * inclui `canUndo`/`canRedo` prontos, sem a UI precisar deduzir sozinha. */
  getEditedTimeline: (editProjectId: string) => Promise<GetEditedTimelineResponse>
  /** Corte/split/remover-intervalo - todos o mesmo primitivo (ver comentario em
   * `RemoveRangeRequestSchema`, shared). `startMs`/`endMs` relativos a timeline EDITADA ATUAL, nao
   * a bruta. Poda qualquer "refazer" pendente. Retorna a timeline editada ja recalculada. */
  removeRange: (
    editProjectId: string,
    startMs: number,
    endMs: number
  ) => Promise<GetEditedTimelineResponse>
  /** EDIT-007 - desfaz a ultima operacao ativa (move o cursor pra tras, nunca apaga o log).
   * Rejeita se nao houver nada pra desfazer. */
  undo: (editProjectId: string) => Promise<GetEditedTimelineResponse>
  /** EDIT-007 - refaz a proxima operacao pendente (move o cursor pra frente). Rejeita se nao
   * houver nada pra refazer (nenhuma operacao criada depois do undo que a invalidaria). */
  redo: (editProjectId: string) => Promise<GetEditedTimelineResponse>
  /** EDIT-008 - ajusta ganho ([-60, 0] dB) e/ou mudo de uma trilha. Substitui o estado inteiro da
   * trilha (nao acumula com ajustes anteriores) - poda qualquer "refazer" pendente, igual
   * `removeRange`. Rejeita se `trackId` nao existir na timeline editada atual. */
  setTrackGain: (
    editProjectId: string,
    trackId: string,
    gainDb: number,
    muted: boolean
  ) => Promise<GetEditedTimelineResponse>
  /** EDIT-009 - ajusta fade-in/fade-out (ms, relativos ao proprio inicio/fim da trilha) de uma
   * trilha. Substitui o estado inteiro da trilha (nao acumula) - poda qualquer "refazer"
   * pendente, igual `removeRange`/`setTrackGain`. Rejeita se `trackId` nao existir na timeline
   * editada atual. */
  setTrackFade: (
    editProjectId: string,
    trackId: string,
    fadeInMs: number,
    fadeOutMs: number
  ) => Promise<GetEditedTimelineResponse>
  /** EDIT-010 - ajusta visibilidade/posicao/tamanho/forma (PiP) de uma trilha CAMERA. Substitui o
   * estado inteiro da trilha (nao acumula) - poda qualquer "refazer" pendente, igual
   * `removeRange`/`setTrackGain`/`setTrackFade`. Rejeita se `trackId` nao existir na timeline
   * editada atual OU nao for do tipo CAMERA. */
  setTrackCameraTransform: (
    editProjectId: string,
    trackId: string,
    transform: CameraTransform
  ) => Promise<GetEditedTimelineResponse>
  /** EDIT-011 - troca o preset de layout (`PIP`/`SIDE_BY_SIDE`/`SCREEN_ONLY`/`CAMERA_ONLY`) da
   * COMPOSICAO inteira (nao de uma trilha especifica). Substitui o preset ativo (nao acumula) -
   * poda qualquer "refazer" pendente, igual `removeRange`/`setTrackGain`/etc. Sempre aceita
   * qualquer um dos 4 presets, mesmo que as trilhas correspondentes nao existam na gravacao. */
  setLayoutPreset: (editProjectId: string, preset: LayoutPreset) => Promise<GetEditedTimelineResponse>
}

export interface ExportApi {
  start: (request: StartExportRequest) => Promise<ExportJobResponse>
  list: () => Promise<ExportJobResponse[]>
  getStatus: (id: string) => Promise<ExportJobResponse>
  /** EXP-008 - cancela um job em QUEUED/RUNNING (mata o processo FFmpeg real + move o job pra
   * CANCELED); no-op idempotente num job ja terminado. */
  cancel: (id: string) => Promise<ExportJobResponse>
}

/**
 * AI-001 (Fase 5 — Transcrição). `start` sempre enfileira com sucesso (mesmas validacoes de
 * projeto/trilha de audio que uma integracao real teria), mas o job SEMPRE termina `FAILED` nesta
 * fase (nenhum provedor real conectado ainda, ver `TranscriptionService`) - a UI precisa tratar
 * isso como um estado normal/esperado, nao um bug. `getTranscript` devolve `null` quando o
 * projeto nunca teve um transcript `COMPLETED` (nunca lanca so por isso).
 */
export interface TranscriptionApi {
  start: (projectId: string, language?: string) => Promise<TranscriptionJobResponse>
  list: (projectId: string) => Promise<TranscriptionJobResponse[]>
  getStatus: (id: string) => Promise<TranscriptionJobResponse>
  getTranscript: (projectId: string) => Promise<TranscriptResponse | null>
  /** Refinamento pos-MVP - sobrescreve `Transcript.editedText` com o texto inteiro passado (nao um
   * patch). Lanca `NotFoundError` se o projeto nunca teve um transcript `COMPLETED`. */
  updateText: (projectId: string, text: string) => Promise<TranscriptResponse>
}

/**
 * SEARCH-001 (Fase 7 — Knowledge). `projectId` omitido busca em todos os projetos - o caso de uso
 * principal ("memória corporativa pesquisável"); passado, restringe a um projeto so (uso futuro
 * pela Biblioteca). Nunca lanca so por nao achar nada - devolve `hits: []`.
 *
 * `offset` (refinamento "paginação") pagina uma busca já em andamento - a UI chama de novo com um
 * `offset` maior pra "Carregar mais", acumulando os hits já exibidos. `totalCount`/`hasMore` no
 * retorno dizem se ainda há mais pra buscar.
 */
export interface SearchApi {
  transcripts: (query: string, projectId?: string, offset?: number) => Promise<SearchTranscriptsResponse>
}

export interface SystemApi {
  getAppInfo: () => Promise<{ name: string; version: string; platform: string }>
  getDiskSpace: (path?: string) => Promise<{ freeBytes: number; totalBytes: number; path: string }>
}

export interface DevicesApi {
  /** RF-002 - telas/monitores/janelas disponiveis para captura. */
  listScreens: () => Promise<ScreenSource[]>
}

export interface MeetingStudioApi {
  project: ProjectApi
  library: LibraryApi
  settings: SettingsApi
  recording: RecordingApi
  markers: MarkersApi
  recovery: RecoveryApi
  editor: EditorApi
  export: ExportApi
  transcription: TranscriptionApi
  search: SearchApi
  system: SystemApi
  devices: DevicesApi
}
