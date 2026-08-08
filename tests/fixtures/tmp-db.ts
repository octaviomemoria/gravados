import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabaseClient, type DatabaseClient } from '../../src/main/database/client'
import { runMigrations } from '../../src/main/database/migrate'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_FOLDER = resolve(__dirname, '../../src/main/database/migrations')

/** Banco SQLite em memoria, ja migrado - usado por todos os testes que tocam o banco. */
export function createTestDatabase(): DatabaseClient {
  const client = createDatabaseClient({ filePath: ':memory:' })
  runMigrations(client.db, MIGRATIONS_FOLDER)
  return client
}
