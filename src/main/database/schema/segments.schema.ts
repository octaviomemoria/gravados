import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { tracks } from './tracks.schema'

/** 06_DATA_MODEL.md - entidade Segment. `relativePath` e relativo ao `rootPath` do projeto. */
export const segments = sqliteTable(
  'segments',
  {
    id: text('id').primaryKey(),
    trackId: text('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    seqIndex: integer('seq_index').notNull(),
    relativePath: text('relative_path').notNull(),
    startedAtMs: integer('started_at_ms').notNull(),
    endedAtMs: integer('ended_at_ms'),
    durationMs: integer('duration_ms'),
    byteSize: integer('byte_size').notNull().default(0),
    mimeType: text('mime_type').notNull(),
    finalized: integer('finalized', { mode: 'boolean' }).notNull().default(false)
  },
  (table) => [uniqueIndex('idx_segments_track_seq').on(table.trackId, table.seqIndex)]
)
