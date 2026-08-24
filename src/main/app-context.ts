import type { DatabaseClient } from './database/client'
import {
  ProjectRepository,
  TrackRepository,
  SegmentRepository,
  MarkerRepository,
  EditProjectRepository,
  EditOperationRepository,
  ExportJobRepository,
  TranscriptionJobRepository,
  TranscriptRepository,
  SearchRepository,
  SettingsRepository
} from './database/repositories'
import { ProjectService } from './services/project.service'
import { RecoveryService } from './services/recovery.service'
import { EditorService } from './services/editor.service'
import { ExportService } from './services/export.service'
import { TranscriptionService } from './services/transcription.service'
import { WhisperLocalProvider } from './services/transcription/providers/whisper-local-provider'
import type { TranscriptionProvider } from './services/transcription/transcription-provider'
import { SearchService } from './services/search.service'
import { SettingsService, buildDefaultSettings } from './services/settings.service'
import { JobRunner } from './jobs/job-runner'
import { ExportJobStore, type ExportJobPayload, type ExportJobResult } from './jobs/export-job-store'
import {
  TranscriptionJobStore,
  type TranscriptionJobPayload,
  type TranscriptionJobResult
} from './jobs/transcription-job-store'
import { RecordingStateMachine } from './recording/recording-state-machine'
import { RecordingSessionManager } from './recording/recording-session-manager'

/**
 * Raiz de composicao do processo main: instancia repositorios e servicos uma unica vez e os
 * disponibiliza aos handlers IPC. Mantido separado de `main/index.ts` para permitir testes de
 * integracao que montam um `AppContext` contra um banco temporario sem subir o Electron real.
 */
export interface AppContext {
  databaseClient: DatabaseClient
  projectRepository: ProjectRepository
  exportJobRepository: ExportJobRepository
  transcriptionJobRepository: TranscriptionJobRepository
  transcriptRepository: TranscriptRepository
  searchRepository: SearchRepository
  settingsRepository: SettingsRepository
  markerRepository: MarkerRepository
  editProjectRepository: EditProjectRepository
  editOperationRepository: EditOperationRepository
  projectService: ProjectService
  recoveryService: RecoveryService
  editorService: EditorService
  exportService: ExportService
  transcriptionService: TranscriptionService
  searchService: SearchService
  settingsService: SettingsService
  exportJobRunner: JobRunner<ExportJobPayload, ExportJobResult>
  transcriptionJobRunner: JobRunner<TranscriptionJobPayload, TranscriptionJobResult>
  recordingStateMachine: RecordingStateMachine
  recordingSessionManager: RecordingSessionManager
}

export interface CreateAppContextOptions {
  databaseClient: DatabaseClient
  libraryRootPath: string
  /** Refinamento pos-SEARCH-001 - onde `@huggingface/transformers` cacheia os pesos do modelo
   * Whisper escolhido (`getWhisperModelsCacheDir()`, `app-paths.ts`). Opcional pra nao acoplar
   * testes de integracao (que montam este contexto sem Electron real) a `app.getPath` - quando
   * omitido, a biblioteca usa seu proprio cache padrao (irrelevante em teste, que sempre injeta um
   * `pipelineFactory` falso e nunca baixa nada de verdade).
   */
  whisperModelsCacheDir?: string
  /** Somente para os testes E2E (`MEETING_STUDIO_E2E_FAKE_TRANSCRIPTION=1`, setado so por
   * `tests/e2e/library.spec.ts`): substitui `WhisperLocalProvider` real por um provedor falso
   * (sem rede, resultado instantaneo) - mesmo raciocinio ja usado por
   * `MEETING_STUDIO_E2E_FAKE_MEDIA` pra camera/microfone. Sem isso, clicar "Transcrever" na UI
   * baixaria um modelo real da internet (~150MB+) toda vez que a suite E2E rodasse - uma
   * dependencia de rede/tempo que este projeto mantem deliberadamente fora de qualquer teste
   * automatizado (ver decisao registrada no README). O pipeline real (extracao de audio +
   * orquestracao do provedor) ja tem cobertura completa e deterministica em
   * `transcription.service.test.ts`, que injeta o mesmo tipo de provedor falso diretamente. */
  transcriptionProviderOverride?: TranscriptionProvider
}

export function createAppContext(options: CreateAppContextOptions): AppContext {
  const { databaseClient, libraryRootPath, whisperModelsCacheDir, transcriptionProviderOverride } = options

  const projectRepository = new ProjectRepository(databaseClient.db)
  const trackRepository = new TrackRepository(databaseClient.db)
  const segmentRepository = new SegmentRepository(databaseClient.db)
  const markerRepository = new MarkerRepository(databaseClient.db)
  const editProjectRepository = new EditProjectRepository(databaseClient.db)
  const editOperationRepository = new EditOperationRepository(databaseClient.db)
  const exportJobRepository = new ExportJobRepository(databaseClient.db)
  const transcriptionJobRepository = new TranscriptionJobRepository(databaseClient.db)
  const transcriptRepository = new TranscriptRepository(databaseClient.db)
  const searchRepository = new SearchRepository(databaseClient.db)
  const settingsRepository = new SettingsRepository(databaseClient.db)

  const projectService = new ProjectService(
    projectRepository,
    trackRepository,
    segmentRepository,
    libraryRootPath
  )
  const recoveryService = new RecoveryService(
    projectRepository,
    trackRepository,
    segmentRepository,
    libraryRootPath
  )
  const editorService = new EditorService(
    editProjectRepository,
    projectRepository,
    trackRepository,
    segmentRepository,
    editOperationRepository,
    databaseClient.db
  )
  const settingsService = new SettingsService(
    settingsRepository,
    buildDefaultSettings(libraryRootPath)
  )
  const exportJobRunner = new JobRunner<ExportJobPayload, ExportJobResult>(
    new ExportJobStore(exportJobRepository)
  )
  const exportService = new ExportService(
    editProjectRepository,
    projectRepository,
    editorService,
    exportJobRunner,
    exportJobRepository
  )
  const transcriptionJobRunner = new JobRunner<TranscriptionJobPayload, TranscriptionJobResult>(
    new TranscriptionJobStore(transcriptionJobRepository)
  )
  // Refinamento pos-SEARCH-001 - modelo cacheado FORA da pasta de gravacoes (ver comentario em
  // `getWhisperModelsCacheDir`). Bug real encontrado testando no app EMPACOTADO: configurar isso
  // aqui via um `env` importado ESTATICAMENTE (como este arquivo fazia antes) nao tinha NENHUM
  // efeito - `@huggingface/transformers` resolve pra um ARQUIVO diferente (e portanto um `env`
  // singleton diferente) dependendo de `import` estatico vs dinamico; `WhisperLocalProvider` agora
  // recebe o caminho e configura o `env` do MESMO import dinamico que de fato carrega o modelo
  // (ver comentario completo em `loadRealWhisperPipeline`). Omitido (testes de integracao que
  // montam este contexto sem Electron real) cai no cache padrao da propria biblioteca - irrelevante
  // em teste, que sempre injeta um `pipelineFactory` falso e nunca baixa nada de verdade.
  const whisperLocalProvider: TranscriptionProvider =
    transcriptionProviderOverride ??
    new WhisperLocalProvider(
      () => settingsService.get('transcription').modelId,
      undefined,
      whisperModelsCacheDir
    )
  const transcriptionService = new TranscriptionService(
    projectRepository,
    trackRepository,
    segmentRepository,
    transcriptionJobRunner,
    transcriptionJobRepository,
    transcriptRepository,
    whisperLocalProvider
  )
  // SEARCH-001 - busca full-text 100% local (FTS5), sem dependencia de AI-002/provedor externo -
  // ver `search.service.ts` pro raciocinio completo.
  const searchService = new SearchService(searchRepository)
  const recordingStateMachine = new RecordingStateMachine()
  const recordingSessionManager = new RecordingSessionManager(
    projectRepository,
    trackRepository,
    segmentRepository,
    markerRepository,
    recordingStateMachine,
    libraryRootPath
  )

  return {
    databaseClient,
    projectRepository,
    exportJobRepository,
    transcriptionJobRepository,
    transcriptRepository,
    searchRepository,
    settingsRepository,
    markerRepository,
    editProjectRepository,
    editOperationRepository,
    projectService,
    recoveryService,
    editorService,
    exportService,
    transcriptionService,
    searchService,
    settingsService,
    exportJobRunner,
    transcriptionJobRunner,
    recordingStateMachine,
    recordingSessionManager
  }
}
