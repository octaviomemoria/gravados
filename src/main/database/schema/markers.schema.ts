import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { projects } from './projects.schema'

/** 06_DATA_MODEL.md - entidade Marker. */
export const markers = sqliteTable(
  'markers',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    timestampMs: integer('timestamp_ms').notNull(),
    title: text('title'),
    note: text('note')
  },
  (table) => [index('idx_markers_project_timestamp').on(table.projectId, table.timestampMs)]
)
