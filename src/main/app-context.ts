import type { DatabaseClient } from './database/client'
import {
  ProjectRepository,
  ExportJobRepository,
  SettingsRepository
} from './database/repositories'
import { ProjectService } from './services/project.service'
import { SettingsService, buildDefaultSettings } from './services/settings.service'
import { JobRunner } from './jobs/job-runner'
import { ExportJobStore, type ExportJobPayload, type ExportJobResult } from './jobs/export-job-store'
import { RecordingStateMachine } from './recording/recording-state-machine'

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
  projectService: ProjectService
  settingsService: SettingsService
  exportJobRunner: JobRunner<ExportJobPayload, ExportJobResult>
  recordingStateMachine: RecordingStateMachine
}

export interface CreateAppContextOptions {
  databaseClient: DatabaseClient
  libraryRootPath: string
}

export function createAppContext(options: CreateAppContextOptions): AppContext {
  const { databaseClient, libraryRootPath } = options

  const projectRepository = new ProjectRepository(databaseClient.db)
  const exportJobRepository = new ExportJobRepository(databaseClient.db)
  const settingsRepository = new SettingsRepository(databaseClient.db)

  const projectService = new ProjectService(projectRepository, libraryRootPath)
  const settingsService = new SettingsService(
    settingsRepository,
    buildDefaultSettings(libraryRootPath)
  )
  const exportJobRunner = new JobRunner<ExportJobPayload, ExportJobResult>(
    new ExportJobStore(exportJobRepository)
  )
  const recordingStateMachine = new RecordingStateMachine()

  return {
    databaseClient,
    projectRepository,
    exportJobRepository,
    settingsRepository,
    projectService,
    settingsService,
    exportJobRunner,
    recordingStateMachine
  }
}
