import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type AppDatabase = BetterSQLite3Database<typeof schema>

export interface DatabaseClient {
  db: AppDatabase
  sqlite: Database.Database
  close: () => void
}

export interface CreateDatabaseClientOptions {
  /** Caminho do arquivo .db, ou ':memory:' para bancos efemeros (usado por testes). */
  filePath: string
}

/**
 * Cria a conexao SQLite + wrapper Drizzle. Funcao pura, sem dependencia do modulo `electron`
 * (12_DEVELOPMENT_STANDARDS.md: "dominio nao deve depender de Electron quando nao necessario") -
 * quem decide o `filePath` real (userData em producao, arquivo temporario em teste) e o chamador.
 */
export function createDatabaseClient(options: CreateDatabaseClientOptions): DatabaseClient {
  const sqlite = new Database(options.filePath)

  // WAL nao se aplica a bancos em memoria (usados em testes) - SQLite ignora nesse caso, mas o
  // guard deixa a intencao explicita.
  if (options.filePath !== ':memory:') {
    sqlite.pragma('journal_mode = WAL')
  }
  // SQLite desabilita FKs por padrao; sem isso, ON DELETE CASCADE/SET NULL nao teriam efeito.
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  return {
    db,
    sqlite,
    close: () => sqlite.close()
  }
}
