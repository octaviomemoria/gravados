import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { RECORDING_STATES } from '../../../shared/types/recording-state'

/**
 * 06_DATA_MODEL.md - entidade Project. `status` reaproveita o union de RecordingState
 * (decisao registrada - ver README, secao "Decisoes de arquitetura").
 * Import relativo deliberado (nao usa o alias `@shared`): este arquivo e carregado tanto pelo
 * build normal (electron-vite/vitest, que entendem o alias) quanto diretamente pela CLI do
 * drizzle-kit (`db:generate`/`db:push`/`db:studio`), que nao necessariamente resolve aliases do
 * tsconfig - import relativo funciona em ambos sem depender de configuracao adicional.
 */
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    createdAt: text('created_at').notNull(),
    startedAt: text('started_at'),
    endedAt: text('ended_at'),
    durationMs: integer('duration_ms'),
    status: text('status', { enum: RECORDING_STATES }).notNull(),
    rootPath: text('root_path').notNull(),
    notes: text('notes')
  },
  (table) => [
    index('idx_projects_created_at').on(table.createdAt),
    index('idx_projects_status').on(table.status)
  ]
)
