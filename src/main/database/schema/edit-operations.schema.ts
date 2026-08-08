import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { editProjects } from './edit-projects.schema'
import { tracks } from './tracks.schema'

/**
 * 06_DATA_MODEL.md - entidade EditOperation. `payloadJson` guarda campos especificos do tipo de
 * operacao (ex.: `gainDb` para SET_GAIN) - ver exemplo em 05_MEDIA_EDITOR.md secao 6.
 */
export const editOperations = sqliteTable(
  'edit_operations',
  {
    id: text('id').primaryKey(),
    editProjectId: text('edit_project_id')
      .notNull()
      .references(() => editProjects.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    startMs: integer('start_ms'),
    endMs: integer('end_ms'),
    trackId: text('track_id').references(() => tracks.id, { onDelete: 'set null' }),
    payloadJson: text('payload_json').notNull()
  },
  (table) => [index('idx_edit_operations_project_sequence').on(table.editProjectId, table.sequence)]
)
