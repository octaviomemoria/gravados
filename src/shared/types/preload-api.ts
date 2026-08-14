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
import type { StartExportRequest, ExportJobResponse } from '../schemas/export.schema'
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
  /** LIB-004 - renomeia o titulo do projeto. Rejeita se houver gravacao ativa. */
  rename: (id: string, title: string) => Promise<ProjectResponse>
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
}

export interface RecoveryApi {
  /** RECOV-003 - repara um projeto `RECOVERABLE` (detectado no boot), validando cada segmento
   * contra o arquivo real no disco. Rejeita se o projeto nao estiver `RECOVERABLE`. */
  repair: (id: string) => Promise<RepairProjectResponse>
}

export interface ExportApi {
  start: (request: StartExportRequest) => Promise<ExportJobResponse>
  list: () => Promise<ExportJobResponse[]>
  getStatus: (id: string) => Promise<ExportJobResponse>
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
  export: ExportApi
  system: SystemApi
  devices: DevicesApi
}
