import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { projects } from './projects.schema'

/**
 * 06_DATA_MODEL.md - entidade EditProject. Nenhum canal IPC expoe esta tabela ainda (sem UI de
 * editor nesta fase) - existe apenas para persistencia/tipagem, conforme 05_MEDIA_EDITOR.md.
 */
export const editProjects = sqliteTable(
  'edit_projects',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1)
  },
  (table) => [index('idx_edit_projects_project_id').on(table.projectId)]
)
