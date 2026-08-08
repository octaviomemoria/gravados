import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * 06_DATA_MODEL.md secao 3 + RF-041: settings dividida em categorias conceituais sem schema de
 * campos fixo na documentacao. Decisao registrada: chave-valor generico aqui; cada categoria e
 * validada por seu proprio Zod schema em `shared/schemas/settings.schema.ts` (nao em SQL).
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull()
})
