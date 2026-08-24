import { app } from 'electron'
import { createScopedLogger } from './services/logger'

const logger = createScopedLogger('app-lifecycle')

/**
 * Impede duas instancias disputando o mesmo SQLite/estado de gravacao ao mesmo tempo (principio
 * de confiabilidade - AGENTS.md, criterio principal: preferir o que preserva dados do usuario).
 * Retorna `true` se esta e a instancia primaria (deve continuar a inicializacao), `false` caso
 * contrario (o chamador deve encerrar o processo imediatamente).
 */
export function acquireSingleInstanceLock(onSecondInstance: () => void): boolean {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    return false
  }
  app.on('second-instance', onSecondInstance)
  return true
}

export function registerLifecycleHandlers(options: { onAllWindowsClosed: () => void }): void {
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      options.onAllWindowsClosed()
    }
  })

  process.on('unhandledRejection', (reason) => {
    // Achado real investigando um relato do usuario ("erro inesperado" gravando) - so `errorCode`
    // (ex.: "SqliteError") nunca foi suficiente pra diagnosticar sem reproduzir; a mensagem real
    // (nunca o `reason` inteiro - pode carregar dados sensiveis num objeto nao-Error) vai junto a
    // partir de agora, mesmo raciocinio ja aplicado ao resumo de validacao IPC em `ipc-handler.ts`.
    const detail = reason instanceof Error ? reason.message : String(reason)
    logger.error(`unhandledRejection nao tratado no processo main - ${detail}`, {
      operation: 'process.unhandledRejection',
      errorCode: reason instanceof Error ? reason.name : 'UNKNOWN'
    })
  })
}
