import type { DatabaseClient } from './database/client'
import {
  ProjectRepository,
  TrackRepository,
  SegmentRepository,
  MarkerRepository,
  EditProjectRepository,
  EditOperationRepository,
  ExportJobRepository,
  SettingsRepository
} from './database/repositories'
import { ProjectService } from './services/project.service'
import { RecoveryService } from './services/recovery.service'
import { EditorService } from './services/editor.service'
import { ExportService } from './services/export.service'
import { SettingsService, buildDefaultSettings } from './services/settings.service'
import { JobRunner } from './jobs/job-runner'
import { ExportJobStore, type ExportJobPayload, type ExportJobResult } from './jobs/export-job-store'
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
  settingsRepository: SettingsRepository
  markerRepository: MarkerRepository
  editProjectRepository: EditProjectRepository
  editOperationRepository: EditOperationRepository
  projectService: ProjectService
  recoveryService: RecoveryService
  editorService: EditorService
  exportService: ExportService
  settingsService: SettingsService
  exportJobRunner: JobRunner<ExportJobPayload, ExportJobResult>
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
    settingsRepository,
    markerRepository,
    editProjectRepository,
    editOperationRepository,
    projectService,
    recoveryService,
    editorService,
    exportService,
    settingsService,
    exportJobRunner,
    recordingStateMachine,
    recordingSessionManager
  }
}
