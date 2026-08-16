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
  getMigrationsFolderPath,
  getWhisperModelsCacheDir
} from './services/app-paths'
import { configureLogger, createScopedLogger, type LogLevel } from './services/logger'
import {
  registerMeetingMediaSchemeAsPrivileged,
  registerMeetingMediaProtocolHandler
} from './media/media-protocol'
import { APP_ID } from '../shared/constants/app-info'
import type { TranscriptionProvider } from './services/transcription/transcription-provider'

const logger = createScopedLogger('main')
const VALID_LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'verbose', 'debug', 'silly']

// EDIT-003 (Fase 3 - preview): PRECISA rodar antes de `app.whenReady()`, no topo do modulo, fora
// de qualquer funcao - exigencia do Electron para marcar o esquema `meeting-media:` como
// privilegiado (standard/secure/com suporte a Fetch e streaming).
registerMeetingMediaSchemeAsPrivileged()

function resolveLogLevel(): LogLevel {
  const raw = process.env.MEETING_STUDIO_LOG_LEVEL
  return (VALID_LOG_LEVELS as readonly string[]).includes(raw ?? '') ? (raw as LogLevel) : 'info'
}

// Somente para os testes E2E (`tests/e2e/recording.spec.ts`): substitui camera/microfone reais
// por um dispositivo sintetico do Chromium, permitindo testar o pipeline de gravacao de ponta a
// ponta sem hardware real. Nunca ativado fora do processo de teste (variavel de ambiente
// dedicada, setada apenas pelo `electron.launch({ env })` do Playwright).
if (process.env.MEETING_STUDIO_E2E_FAKE_MEDIA === '1') {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
}

/** Somente para o teste E2E de transcricao (`tests/e2e/library.spec.ts`,
 * `MEETING_STUDIO_E2E_FAKE_TRANSCRIPTION=1`): substitui `WhisperLocalProvider` real por um
 * resultado instantaneo, sem rede - clicar "Transcrever" de verdade baixaria um modelo real
 * (~150MB+) na primeira execucao, uma dependencia que a suite automatizada nunca deve exigir (ver
 * comentario completo em `app-context.ts`, `transcriptionProviderOverride`). */
function buildFakeTranscriptionProviderForE2E(): TranscriptionProvider {
  return {
    id: 'WHISPER_LOCAL',
    async transcribe(_request, onProgress) {
      onProgress(100)
      return { model: 'fake-e2e-model', language: null, segments: [{ startMs: 0, endMs: 1000, text: 'teste e2e' }] }
    }
  }
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
    libraryRootPath: getDefaultLibraryRootPath(),
    whisperModelsCacheDir: getWhisperModelsCacheDir(),
    transcriptionProviderOverride:
      process.env.MEETING_STUDIO_E2E_FAKE_TRANSCRIPTION === '1'
        ? buildFakeTranscriptionProviderForE2E()
        : undefined
  })

  // EDIT-003: registrado so agora, com o ProjectRepository real disponivel - o esquema em si ja
  // foi marcado privilegiado no topo do modulo (antes de `app.whenReady()`).
  registerMeetingMediaProtocolHandler(appContext.projectRepository)

  // RECOV-002: roda ANTES do IPC ficar acessivel - nenhuma tela pode chegar a interagir com um
  // projeto ainda marcado com um status de sessao "em andamento" que na verdade morreu com o
  // processo anterior (AGENTS.md: confiabilidade e recuperacao vem antes de qualquer outra coisa).
  try {
    const recovered = await appContext.recoveryService.detectIncomplete()
    if (recovered.length > 0) {
      logger.info(`${recovered.length} gravacao(oes) incompleta(s) detectada(s) no boot`, {
        operation: 'bootstrap.detectIncomplete'
      })
    }
  } catch (error) {
    // Nunca impede o boot - na pior hipotese, um projeto interrompido so aparece como
    // "recuperavel" numa proxima abertura do app.
    logger.error('Falha ao detectar gravacoes incompletas no boot', {
      operation: 'bootstrap.detectIncomplete',
      errorCode: error instanceof Error ? error.name : 'UNKNOWN'
    })
  }

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
