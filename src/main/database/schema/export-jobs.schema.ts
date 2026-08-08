import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { editProjects } from './edit-projects.schema'
import { JOB_STATUSES } from '../../../shared/types/job'

/**
 * 06_DATA_MODEL.md - entidade ExportJob. Unica tabela de job persistida nesta fase (decisao
 * registrada sobre o sistema de jobs generico - ver README, secao "Decisoes de arquitetura").
 */
export const exportJobs = sqliteTable(
  'export_jobs',
  {
    id: text('id').primaryKey(),
    editProjectId: text('edit_project_id')
      .notNull()
      .references(() => editProjects.id, { onDelete: 'cascade' }),
    status: text('status', { enum: JOB_STATUSES }).notNull().default('QUEUED'),
    progress: integer('progress').notNull().default(0),
    outputPath: text('output_path'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at')
  },
  (table) => [index('idx_export_jobs_status').on(table.status)]
)
