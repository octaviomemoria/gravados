import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { AppDatabase } from './client'

/**
 * Aplica as migrations versionadas geradas por `pnpm db:generate` (drizzle-kit) a partir de
 * `src/main/database/schema/*.ts`. Esta E a forma sancionada de alterar o schema em runtime -
 * o que 06_DATA_MODEL.md proibe e mutar schema FORA de um arquivo de migration versionado e
 * revisado (ex.: `ALTER TABLE` manual, ou `drizzle-kit push` chamado pelo app). `db:push`/
 * `db:studio` permanecem comandos manuais de desenvolvimento, nunca usados pelo app ou pelo CI.
 *
 * `migrationsFolder` e recebido explicitamente (nao auto-resolvido via import.meta.url) porque,
 * apos o bundling do electron-vite, o arquivo compilado nao fica mais no mesmo diretorio dos
 * `.sql` de migration - quem resolve o caminho correto (dev vs. build) e `main/index.ts`.
 */
export function runMigrations(db: AppDatabase, migrationsFolder: string): void {
  migrate(db, { migrationsFolder })
}
