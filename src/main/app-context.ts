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
  SettingsRepository
} from './database/repositories'
import { ProjectService } from './services/project.service'
import { RecoveryService } from './services/recovery.service'
import { EditorService } from './services/editor.service'
import { ExportService } from './services/export.service'
import { TranscriptionService } from './services/transcription.service'
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
  settingsRepository: SettingsRepository
  markerRepository: MarkerRepository
  editProjectRepository: EditProjectRepository
  editOperationRepository: EditOperationRepository
  projectService: ProjectService
  recoveryService: RecoveryService
  editorService: EditorService
  exportService: ExportService
  transcriptionService: TranscriptionService
  settingsService: SettingsService
  exportJobRunner: JobRunner<ExportJobPayload, ExportJobResult>
  transcriptionJobRunner: JobRunner<TranscriptionJobPayload, TranscriptionJobResult>
  recordingStateMachine: RecordingStateMachine
  recordingSessionManager: RecordingSessionManager
}

export interface CreateAppContextOptions {
  databaseClient: DatabaseClient
  libraryRootPath: string
}

export function createAppContext(options: CreateAppContextOptions): AppContext {
  const { databaseClient, libraryRootPath } = options

  const projectRepository = new ProjectRepository(databaseClient.db)
  const trackRepository = new TrackRepository(databaseClient.db)
  const segmentRepository = new SegmentRepository(databaseClient.db)
  const markerRepository = new MarkerRepository(databaseClient.db)
  const editProjectRepository = new EditProjectRepository(databaseClient.db)
  const editOperationRepository = new EditOperationRepository(databaseClient.db)
  const exportJobRepository = new ExportJobRepository(databaseClient.db)
  const transcriptionJobRepository = new TranscriptionJobRepository(databaseClient.db)
  const transcriptRepository = new TranscriptRepository(databaseClient.db)
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
  // AI-001 - nenhuma implementacao real de `TranscriptionProvider` e injetada em lugar nenhum
  // ainda nesta fase, ver comentario em `transcription.service.ts` e
  // `transcription/transcription-provider.ts`. `transcription.start` sempre enfileira com
  // sucesso, mas o job sempre termina `FAILED` com uma mensagem clara - AI-002 (incremento futuro)
  // e quem conecta um provedor de verdade.
  const transcriptionService = new TranscriptionService(
    projectRepository,
    trackRepository,
    transcriptionJobRunner,
    transcriptionJobRepository,
    transcriptRepository
  )
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
    settingsRepository,
    markerRepository,
    editProjectRepository,
    editOperationRepository,
    projectService,
    recoveryService,
    editorService,
    exportService,
    transcriptionService,
    settingsService,
    exportJobRunner,
    transcriptionJobRunner,
    recordingStateMachine,
    recordingSessionManager
  }
}
