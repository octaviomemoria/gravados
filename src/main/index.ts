import { app, BrowserWindow, dialog } from 'electron'
import { createDatabaseClient } from './database/client'
import { runMigrations } from './database/migrate'
import { createAppContext, type AppContext } from './app-context'
import { registerAllIpcHandlers } from './ipc/register-ipc-handlers'
import { createMainWindow } from './window'
import { acquireSingleInstanceLock, registerLifecycleHandlers } from './app-lifecycle'
import {
  getDatabaseFilePath,
  getDefaultLibraryRootPath,
  getMigrationsFolderPath
} from './services/app-paths'
import { configureLogger, createScopedLogger, type LogLevel } from './services/logger'
import { APP_ID } from '../shared/constants/app-info'

const logger = createScopedLogger('main')
const VALID_LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'verbose', 'debug', 'silly']

function resolveLogLevel(): LogLevel {
  const raw = process.env.MEETING_STUDIO_LOG_LEVEL
  return (VALID_LOG_LEVELS as readonly string[]).includes(raw ?? '') ? (raw as LogLevel) : 'info'
}

let appContext: AppContext | undefined

/**
 * Ordem de boot deliberada: logger -> lock de instancia unica -> migrations -> contexto/servicos
 * -> registro de IPC -> janela. O banco DEVE estar migrado antes de qualquer handler que o
 * acesse ficar alcancavel (main/index.ts e o unico lugar que decide essa ordem).
 */
async function bootstrap(): Promise<void> {
  configureLogger(resolveLogLevel())
  app.setAppUserModelId(APP_ID)

  const databaseFilePath = getDatabaseFilePath()
  const databaseClient = createDatabaseClient({ filePath: databaseFilePath })

  try {
    runMigrations(databaseClient.db, getMigrationsFolderPath())
  } catch (error) {
    logger.error('Falha ao aplicar migrations - encerrando', {
      operation: 'bootstrap.migrate',
      errorCode: error instanceof Error ? error.name : 'UNKNOWN'
    })
    dialog.showErrorBox(
      'Erro ao iniciar o Meeting Studio',
      'Nao foi possivel preparar o banco de dados local. O aplicativo sera encerrado.'
    )
    app.exit(1)
    return
  }

  appContext = createAppContext({
    databaseClient,
    libraryRootPath: getDefaultLibraryRootPath()
  })

  registerAllIpcHandlers(appContext)
  createMainWindow()
}

const isPrimaryInstance = acquireSingleInstanceLock(() => {
  const [existingWindow] = BrowserWindow.getAllWindows()
  if (existingWindow) {
    if (existingWindow.isMinimized()) existingWindow.restore()
    existingWindow.focus()
  }
})

if (!isPrimaryInstance) {
  app.quit()
} else {
  registerLifecycleHandlers({ onAllWindowsClosed: () => app.quit() })

  // Relevante sobretudo em macOS (fora do escopo Windows-first do MVP, mas nao hostil a ela):
  // recria a janela sem repetir migrations/registro de IPC, que ja rodaram uma vez.
  app.on('activate', () => {
    if (appContext && BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })

  app.on('before-quit', () => {
    appContext?.databaseClient.close()
  })

  void app.whenReady().then(bootstrap)
}
