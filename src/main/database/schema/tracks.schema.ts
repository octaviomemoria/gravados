import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { projects } from './projects.schema'
import { TRACK_TYPES } from '../../../shared/types/entities'

/**
 * 06_DATA_MODEL.md - entidade Track. Canonico: `SCREEN|CAMERA|MICROPHONE|SYSTEM_AUDIO`
 * (maiusculo/underscore). O manifest.json de recuperacao usa um formato minusculo separado e
 * deliberadamente isolado - ver `main/media/project-filesystem.ts`.
 */
export const tracks = sqliteTable(
  'tracks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: text('type', { enum: TRACK_TYPES }).notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    position: integer('position').notNull(),
    startOffsetMs: integer('start_offset_ms').notNull().default(0)
  },
  (table) => [index('idx_tracks_project_id').on(table.projectId)]
)
