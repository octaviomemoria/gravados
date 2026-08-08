import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { settings } from '../schema'

/**
 * Repositorio chave-valor generico para `settings` (decisao registrada - ver README).
 * Validacao de formato por categoria acontece em `main/services/settings.service.ts`, nao aqui.
 */
export class SettingsRepository {
  constructor(private readonly db: AppDatabase) {}

  get(key: string): unknown | undefined {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get()
    if (!row) return undefined
    return JSON.parse(row.valueJson) as unknown
  }

  set(key: string, value: unknown, updatedAt: string): void {
    const valueJson = JSON.stringify(value)
    this.db
      .insert(settings)
      .values({ key, valueJson, updatedAt })
      .onConflictDoUpdate({ target: settings.key, set: { valueJson, updatedAt } })
      .run()
  }
}
