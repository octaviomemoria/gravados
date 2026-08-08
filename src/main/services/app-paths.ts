import { app } from 'electron'
import { join } from 'node:path'
import { defaultLibraryRootPath } from '../media/project-filesystem'

const DATABASE_FILE_NAME = 'meeting-studio.db'

/**
 * Unico ponto que le `app.getPath(...)`/`app.getAppPath()`. Mantido fora de `database/client.ts`
 * e `media/project-filesystem.ts` para nao acoplar essas camadas a Electron
 * (12_DEVELOPMENT_STANDARDS.md: "dominio nao deve depender de Electron quando nao necessario").
 * Decisao registrada: caminhos nao especificados pela documentacao (ver README).
 */
export function getDatabaseFilePath(): string {
  return join(app.getPath('userData'), DATABASE_FILE_NAME)
}

export function getDefaultLibraryRootPath(): string {
  return defaultLibraryRootPath(app.getPath('documents'))
}

/**
 * Em dev/build (`!app.isPackaged`) as migrations sao lidas diretamente do codigo-fonte. O branch
 * empacotado existe para compatibilidade futura, mas nao e exercitado nesta fase - empacotamento
 * real via electron-builder (com copia de `migrations/` para `resources/`) e deferido (decisao
 * registrada, ver README).
 */
export function getMigrationsFolderPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'migrations')
  }
  return join(app.getAppPath(), 'src', 'main', 'database', 'migrations')
}
